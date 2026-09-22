const assert = require('node:assert');
const { test } = require('node:test');
const {
  validatePrintingConfig,
  toSocketPrintingConfig,
  PrintingConfigValidationError,
  PHOTO_ADJUST_LIMITS,
  PHOTO_FIT_MODES,
} = require('../utils/printingConfigValidation');

/**
 * Pengaturan tampilan foto + kalibrasi cetak.
 *
 * Kenapa diuji serius: nilai-nilai ini dulunya hanya hidup di halaman uji
 * localhost (kertas, kepekatan, geser) atau ter-hardcode di Photobooth
 * (brightness/contrast/saturasi). Setelah dipindah ke Admin, salah set akan
 * diam-diam merusak hasil cetak pelanggan — dan pada printer termal 1-bit,
 * foto yang terlalu terang hilang sama sekali (tidak ada abu-abu, hanya ada
 * atau tidak ada titik).
 */

const base = {
  printing_enabled: true,
  adapter: 'thermal',
  printer_name: 'B1 Pro',
  paper_size: 'CUSTOM 54X67 MM',
};

test('nilai bawaan netral: tidak mengubah foto', () => {
  const out = validatePrintingConfig(base, {});
  assert.strictEqual(out.photo_brightness, 100);
  assert.strictEqual(out.photo_contrast, 100);
  assert.strictEqual(out.photo_saturation, 100);
  assert.strictEqual(out.photo_fit_mode, 'fit');
  assert.strictEqual(out.thermal_density, 3);
  assert.strictEqual(out.thermal_offset_y_px, 0);
});

test('ukuran kertas kustom 54x67 mm diterima', () => {
  const out = validatePrintingConfig(base, {});
  assert.strictEqual(out.paper_size, 'CUSTOM 54X67 MM');
});

test('nilai yang dikirim Admin tersimpan apa adanya', () => {
  const out = validatePrintingConfig(
    { ...base, photo_brightness: 120, photo_contrast: 135, photo_saturation: 80, thermal_density: 5, thermal_offset_y_px: -12 },
    {}
  );
  assert.strictEqual(out.photo_brightness, 120);
  assert.strictEqual(out.photo_contrast, 135);
  assert.strictEqual(out.photo_saturation, 80);
  assert.strictEqual(out.thermal_density, 5);
  assert.strictEqual(out.thermal_offset_y_px, -12);
});

test('saturasi 0 sah (hitam putih), bukan dianggap kosong', () => {
  const out = validatePrintingConfig({ ...base, photo_saturation: 0 }, {});
  assert.strictEqual(out.photo_saturation, 0);
});

test('offset negatif (geser ke atas) diterima', () => {
  const out = validatePrintingConfig({ ...base, thermal_offset_y_px: -50 }, {});
  assert.strictEqual(out.thermal_offset_y_px, -50);
});

test('nilai di luar batas DITOLAK, tidak dipangkas diam-diam', () => {
  // Memangkas diam-diam berbahaya: Admin mengira nilainya terpakai padahal tidak.
  const cases = [
    { photo_brightness: 400 },
    { photo_brightness: 10 },
    { photo_contrast: 0 },
    { photo_contrast: 999 },
    { photo_saturation: -5 },
    { photo_saturation: 500 },
    { thermal_density: 0 },
    { thermal_density: 9 },
    { thermal_offset_y_px: 5000 },
    { thermal_offset_y_px: -5000 },
  ];
  for (const patch of cases) {
    assert.throws(
      () => validatePrintingConfig({ ...base, ...patch }, {}),
      PrintingConfigValidationError,
      `${JSON.stringify(patch)} seharusnya ditolak`
    );
  }
});

test('mode penyesuaian foto hanya fit atau stretch', () => {
  assert.strictEqual(validatePrintingConfig({ ...base, photo_fit_mode: 'stretch' }, {}).photo_fit_mode, 'stretch');
  assert.strictEqual(validatePrintingConfig({ ...base, photo_fit_mode: 'FIT' }, {}).photo_fit_mode, 'fit');
  assert.throws(() => validatePrintingConfig({ ...base, photo_fit_mode: 'gepeng' }, {}), PrintingConfigValidationError);
});

test('nilai kosong/string angka dari form HTML tetap diterima', () => {
  const out = validatePrintingConfig(
    { ...base, photo_brightness: '110', photo_contrast: '90', thermal_density: '4', thermal_offset_y_px: '7' },
    {}
  );
  assert.strictEqual(out.photo_brightness, 110);
  assert.strictEqual(out.photo_contrast, 90);
  assert.strictEqual(out.thermal_density, 4);
  assert.strictEqual(out.thermal_offset_y_px, 7);
});

test('field asing tetap ditolak (tidak ada celah injeksi)', () => {
  assert.throws(
    () => validatePrintingConfig({ ...base, shell_command: 'rm -rf /' }, {}),
    (err) => err.code === 'FORBIDDEN_FIELD'
  );
  assert.throws(
    () => validatePrintingConfig({ ...base, photo_brightness_extra: 5 }, {}),
    (err) => err.code === 'UNKNOWN_FIELD'
  );
});

test('konfigurasi lama tanpa kolom baru tidak rusak', () => {
  const existing = { printing_enabled: true, adapter: 'thermal', printer_name: 'B1', paper_size: 'CUSTOM 54X67 MM', orientation: 'portrait' };
  const out = validatePrintingConfig({ copies_limit: 2 }, existing);
  assert.strictEqual(out.photo_brightness, 100, 'fallback netral');
  assert.strictEqual(out.thermal_density, 3);
  assert.strictEqual(out.copies_limit, 2);
});

test('nilai tersimpan dipakai sebagai dasar saat hanya sebagian diubah', () => {
  const existing = { ...base, photo_brightness: 120, photo_contrast: 130, thermal_density: 5 };
  const out = validatePrintingConfig({ photo_contrast: 140 }, existing);
  assert.strictEqual(out.photo_brightness, 120, 'tidak ikut ter-reset');
  assert.strictEqual(out.photo_contrast, 140, 'yang diubah terpakai');
  assert.strictEqual(out.thermal_density, 5);
});

test('dikirim ke kiosk-agent lewat socket, bukan hanya disimpan', () => {
  // Kalau nilai hanya tersimpan di DB tanpa masuk payload socket, Admin akan
  // terlihat "tersimpan" tetapi cetakan tidak berubah — bug yang sama seperti
  // ukuran kertas sebelumnya.
  const payload = toSocketPrintingConfig({
    printing_enabled: 1, adapter: 'thermal', printer_name: 'B1 Pro',
    paper_size: 'CUSTOM 54X67 MM', orientation: 'portrait',
    copies_limit: 1, timeout_ms: 60000, retry_count: 2, config_version: 7,
    allowed_layouts: '[]',
    photo_brightness: 118, photo_contrast: 126, photo_saturation: 96,
    thermal_density: 4, thermal_offset_y_px: -8, photo_fit_mode: 'stretch',
  });
  assert.strictEqual(payload.photo_brightness, 118);
  assert.strictEqual(payload.photo_contrast, 126);
  assert.strictEqual(payload.photo_saturation, 96);
  assert.strictEqual(payload.thermal_density, 4);
  assert.strictEqual(payload.thermal_offset_y_px, -8);
  assert.strictEqual(payload.photo_fit_mode, 'stretch');
  assert.strictEqual(payload.paper_size, 'CUSTOM 54X67 MM');
  assert.strictEqual(payload.config_version, 7);
});

test('payload socket punya nilai bawaan aman kalau kolom belum ada', () => {
  const payload = toSocketPrintingConfig({
    printing_enabled: 1, adapter: 'thermal', printer_name: 'B1',
    paper_size: '4R', orientation: 'portrait', copies_limit: 1,
    timeout_ms: 60000, retry_count: 2, config_version: 1,
  });
  assert.strictEqual(payload.photo_brightness, 100);
  assert.strictEqual(payload.photo_contrast, 100);
  assert.strictEqual(payload.photo_saturation, 100);
  assert.strictEqual(payload.thermal_density, 3);
  assert.strictEqual(payload.thermal_offset_y_px, 0);
  assert.strictEqual(payload.photo_fit_mode, 'fit');
});

test('batas yang diumumkan konsisten dengan yang divalidasi', () => {
  // Admin memakai batas ini untuk slider; kalau tidak cocok, slider akan
  // menawarkan nilai yang ditolak backend.
  for (const [field, limit] of Object.entries(PHOTO_ADJUST_LIMITS)) {
    assert.ok(limit.min < limit.max, `${field}: min harus < max`);
    assert.ok(limit.fallback >= limit.min && limit.fallback <= limit.max,
      `${field}: fallback harus di dalam rentang`);
    assert.strictEqual(validatePrintingConfig({ ...base, [field]: limit.min }, {})[field], limit.min);
    assert.strictEqual(validatePrintingConfig({ ...base, [field]: limit.max }, {})[field], limit.max);
    assert.throws(() => validatePrintingConfig({ ...base, [field]: limit.min - 1 }, {}));
    assert.throws(() => validatePrintingConfig({ ...base, [field]: limit.max + 1 }, {}));
  }
  assert.deepStrictEqual(PHOTO_FIT_MODES, ['fit', 'stretch']);
});

test('saturasi 0 tetap boleh padahal batas bawahnya 0', () => {
  const limit = PHOTO_ADJUST_LIMITS.photo_saturation;
  assert.strictEqual(limit.min, 0);
  assert.strictEqual(validatePrintingConfig({ ...base, photo_saturation: 0 }, {}).photo_saturation, 0);
});
