const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validatePrintingConfig,
  PrintingConfigValidationError,
} = require('../utils/printingConfigValidation');

const supported = {
  supported_adapters: ['disabled', 'cups', 'mock'],
  available_printers: [{ name: 'Canon SELPHY CP1500', status: 'READY' }],
};

test('normalizes disabled printing and clears adapter/printer', () => {
  assert.deepEqual(validatePrintingConfig({ printing_enabled: false, adapter: 'cups', printer_name: 'ignored' }), {
    printing_enabled: false,
    adapter: 'disabled',
    printer_name: null,
    paper_size: 'Instax Mini (54 × 86 mm)',
    orientation: 'portrait',
    copies_limit: 1,
    timeout_ms: 60000,
    retry_count: 2,
    allowed_layouts: [],
    // Penyesuaian tampilan + kalibrasi: nilai netral, tidak mengubah foto.
    // Ikut di sini supaya perubahan bawaan tertangkap test, bukan diam-diam.
    photo_brightness: 100,
    photo_contrast: 100,
    photo_saturation: 100,
    thermal_density: 3,
    thermal_offset_y_px: 0,
    thermal_offset_x_px: 0,
    print_margin_top_px: 0,
    print_margin_right_px: 0,
    print_margin_left_px: 0,
    print_margin_bottom_px: 0,
    photo_fit_mode: 'fit',
    // Ketajaman: bawaan = perilaku lama (tanpa penajaman, Rec.601). Diuji di
    // sini supaya kalau bawaannya berubah, kiosk yang sudah dikalibrasi tidak
    // ikut berubah diam-diam.
    print_sharpen: 0,
    grayscale_algorithm: 'rec601',
  });
});

test('algoritma abu-abu asing DITOLAK, bukan diganti diam-diam', () => {
  // Kalau diganti diam-diam, operator memilih satu algoritma di panel dan
  // kertasnya keluar dengan algoritma lain tanpa ada yang memberi tahu.
  assert.throws(() => validatePrintingConfig({ adapter: 'cups', grayscale_algorithm: 'hijau' }),
    /grayscale_algorithm must be one of/);
  // String kosong = belum diisi (mis. kolom baru di DB), jadi dianggap bawaan —
  // BUKAN nilai asing. Membedakan keduanya penting: menolak string kosong akan
  // membuat kiosk lama gagal menyimpan konfigurasi yang sebenarnya belum diubah.
  assert.strictEqual(
    validatePrintingConfig({ adapter: 'cups', grayscale_algorithm: '' }).grayscale_algorithm,
    'rec601');
  // Yang dikenal: dinormalkan ke huruf kecil, jadi penulisan bebas huruf besar
  // tidak ditolak.
  assert.strictEqual(
    validatePrintingConfig({ adapter: 'cups', grayscale_algorithm: 'REC709' }).grayscale_algorithm,
    'rec709');
  // Bawaan = perilaku lama.
  assert.strictEqual(validatePrintingConfig({ adapter: 'cups' }).grayscale_algorithm, 'rec601');
});

test('penajaman dijepit ke 0..100 — nilai di luar itu mengubah gambar, bukan menajam', () => {
  assert.strictEqual(validatePrintingConfig({ adapter: 'cups', print_sharpen: 0 }).print_sharpen, 0);
  assert.strictEqual(validatePrintingConfig({ adapter: 'cups', print_sharpen: 100 }).print_sharpen, 100);
  assert.throws(() => validatePrintingConfig({ adapter: 'cups', print_sharpen: 101 }), PrintingConfigValidationError);
  assert.throws(() => validatePrintingConfig({ adapter: 'cups', print_sharpen: -1 }), PrintingConfigValidationError);
});

test('rejects unsupported adapter and arbitrary command fields', () => {
  assert.throws(() => validatePrintingConfig({ adapter: 'shell' }), PrintingConfigValidationError);
  assert.throws(() => validatePrintingConfig({ command: 'lp' }), /not accepted/);
  assert.throws(() => validatePrintingConfig({ executable_path: '/usr/bin/lp' }), /not accepted/);
});

test('rejects copies and timeout outside policy', () => {
  assert.throws(() => validatePrintingConfig({ copies_limit: 11 }), /copies_limit/);
  assert.throws(() => validatePrintingConfig({ timeout_ms: 4999 }), /timeout_ms/);
  assert.throws(() => validatePrintingConfig({ retry_count: 4 }), /retry_count/);
});

test('requires reported supported adapter and printer when enabling', () => {
  assert.throws(() => validatePrintingConfig({ printing_enabled: true, adapter: 'windows', printer_name: 'X' }, {}, supported), /not supported/);
  assert.throws(() => validatePrintingConfig({ printing_enabled: true, adapter: 'cups', printer_name: 'Other Printer' }, {}, supported), /not reported/);
  assert.deepEqual(validatePrintingConfig({ printing_enabled: true, adapter: 'cups', printer_name: 'Canon SELPHY CP1500' }, {}, supported).printing_enabled, true);
});

// Regresi: kiosk yang BELUM pernah terhubung melaporkan supported_adapters = [].
// Daftar kosong itu berarti "belum ada laporan", bukan "tidak mendukung apa pun".
// Sebelumnya Admin diblokir menyimpan adapter apa pun pada kiosk seperti ini.
test('agent yang belum melaporkan dukungan tidak memblokir pengaturan Admin', () => {
  const row = { adapter: 'windows', paper_size: '4R', printing_enabled: 1, printer_name: 'B1', orientation: 'portrait', copies_limit: 1, timeout_ms: 60000, retry_count: 2 };
  const belumLapor = { adapter: null, supported_adapters: [], available_printers: [] };
  const hasil = validatePrintingConfig({ adapter: 'windows', printer_name: 'B1 Pro', printing_enabled: true, paper_size: 'Instax Mini (54 × 86 mm)' }, row, belumLapor);
  assert.strictEqual(hasil.adapter, 'windows', 'adapter harus bisa disimpan sebelum agent melapor');
  assert.strictEqual(hasil.printer_name, 'B1 Pro');
});

test('agent yang sudah melaporkan tetap membatasi adapter', () => {
  const row = { adapter: 'windows', paper_size: '4R', printing_enabled: 1, printer_name: 'B1', orientation: 'portrait', copies_limit: 1, timeout_ms: 60000, retry_count: 2 };
  // Agent melaporkan hanya mendukung cups -> windows harus ditolak.
  const sudahLapor = { adapter: 'cups', supported_adapters: ['cups'], available_printers: [] };
  assert.throws(
    () => validatePrintingConfig({ adapter: 'windows', printer_name: 'B1 Pro', printing_enabled: true, paper_size: 'Instax Mini (54 × 86 mm)' }, row, sudahLapor),
    /not supported by this Kiosk Agent/,
    'laporan yang nyata harus tetap dihormati',
  );
});
