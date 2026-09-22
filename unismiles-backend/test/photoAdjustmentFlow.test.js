const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Rantai pengaturan tampilan foto dari Admin sampai photobooth.
 *
 * Kenapa test ini ada: nilai ukuran kertas SEBELUMNYA pernah "tersimpan" di
 * Admin tetapi tidak pernah dipakai, karena agent menyimpannya ke printerConfig
 * tanpa melaporkannya ke photobooth. Admin terlihat berhasil, cetakan tidak
 * berubah, dan tidak ada error di mana pun. Test ini memeriksa SETIAP mata
 * rantai, jadi pemutusan serupa tertangkap di sini, bukan di produksi.
 *
 * Rantai: Admin (form) -> backend (validasi + simpan) -> socket payload ->
 *         kiosk-agent (printerConfig + reportedState) -> local bridge ->
 *         photobooth (state + filter canvas).
 */

const backend = path.join(__dirname, '..');
const repo = path.join(backend, '..');
const admin = path.join(repo, 'unismiles-admin', 'src');
const agent = path.join(repo, 'kiosk-agent', 'src');
const photobooth = path.join(repo, 'unismiles-photobooth');

const read = (p) => fs.readFileSync(p, 'utf8');
const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

const FIELDS = ['photo_brightness', 'photo_contrast', 'photo_saturation', 'thermal_density', 'thermal_offset_y_px', 'photo_fit_mode'];

test('mata 1 — Admin: form punya slider/nilai untuk setiap pengaturan', () => {
  const form = read(path.join(admin, 'components', 'PrinterConfiguration.tsx'));
  for (const field of FIELDS) {
    assert.ok(form.includes(field), `form Admin harus punya field ${field}`);
  }
  // Slider brightness/contrast/saturation + input kepekatan/offset + pilihan mode.
  assert.match(form, /type="range"[^>]*min=\{50\}[^>]*max=\{150\}/, 'slider brightness/contrast 50-150');
  assert.match(form, /type="range"[^>]*min=\{0\}[^>]*max=\{150\}/, 'slider saturation 0-150');
  assert.match(form, /type="number"[^>]*min=\{1\}[^>]*max=\{5\}/, 'input kepekatan 1-5');
  assert.match(form, /type="number"[^>]*min=\{-200\}[^>]*max=\{200\}/, 'input geser vertikal -200..200');
});

test('mata 2 — Admin: nilai ikut dikirim saat simpan', () => {
  const form = read(path.join(admin, 'components', 'PrinterConfiguration.tsx'));
  for (const field of FIELDS) {
    assert.match(form, new RegExp(`${field}:\\s*config\\.${field}`),
      `${field} harus ikut di payload simpan, bukan hanya ditampilkan`);
  }
});

/**
 * Ambil pasangan min/max dari elemen input yang MENGENDALIKAN field tertentu.
 *
 * Dikaitkan lewat `value={config.<field>}` di tag yang sama — bukan dengan
 * mencari angka terdekat setelah nama field, karena cara itu cocok ke elemen
 * sebelahnya dan memberi hasil palsu (sudah pernah terjadi saat menulis test ini).
 */
function boundsForField(form, field) {
  // Ambil min/max dari tag <input> yang memuat value={config.<field>}.
  //
  // Catatan penting: `=>` di onChange mengandung karakter '>', jadi pencarian
  // tidak boleh berhenti pada '>' pertama — min/max ada SEBELUM onChange dan
  // akan terlewat. Versi sebelumnya melakukan itu dan gagal membaca batas.
  const idx = form.indexOf('value={config.' + field + '}');
  if (idx < 0) return null;
  const start = form.lastIndexOf('<input', idx);
  if (start < 0) return null;
  const tag = form.slice(start, idx + 200);
  const bounds = tag.match(/min=\{(-?\d+)\}\s*max=\{(-?\d+)\}/);
  return bounds ? { min: Number(bounds[1]), max: Number(bounds[2]) } : null;
}

test('mata 3 — batas di Admin sama dengan batas yang divalidasi backend', () => {
  const { PHOTO_ADJUST_LIMITS } = require('../utils/printingConfigValidation');
  const form = read(path.join(admin, 'components', 'PrinterConfiguration.tsx'));

  // Kalau tidak sama, slider menawarkan nilai yang akan ditolak saat menyimpan.
  for (const field of ['photo_brightness', 'photo_contrast', 'photo_saturation', 'thermal_density', 'thermal_offset_y_px']) {
    const bounds = boundsForField(form, field);
    assert.ok(bounds, `input untuk ${field} harus punya min/max yang bisa dibaca`);
    assert.strictEqual(bounds.min, PHOTO_ADJUST_LIMITS[field].min,
      `${field}: batas bawah Admin harus sama dengan backend`);
    assert.strictEqual(bounds.max, PHOTO_ADJUST_LIMITS[field].max,
      `${field}: batas atas Admin harus sama dengan backend`);
  }
});

test('mata 4 — backend: kolom ada di migrasi, model, dan payload socket', () => {
  const migration = read(path.join(backend, 'migrate_print_calibration.sql'));
  const model = read(path.join(backend, 'models', 'kioskPrintingConfigModel.js'));

  for (const field of FIELDS) {
    // Nama kolom muncul sebagai argumen CALL, jadi bisa berkutip tunggal atau backtick.
    // Dibandingkan lewat indexOf agar tidak perlu menyusun regex di dalam string.
    const quoted = [`'${field}'`, '`' + field + '`', `"${field}"`];
    assert.ok(quoted.some(q => migration.includes(q)), `migrasi harus menambah kolom ${field}`);
    assert.ok(model.includes(field), `model harus membaca/menulis ${field}`);
  }
  // Idempoten: migrasi harus aman dijalankan berulang. MySQL 8.4 tidak
  // mendukung `ADD COLUMN IF NOT EXISTS` (MariaDB saja), jadi bentuk yang benar
  // adalah pengecekan INFORMATION_SCHEMA + ALTER lewat prepared statement.
  //
  // Komentar dibuang dulu: berkas migrasi MENJELASKAN kenapa pola itu tidak
  // dipakai, jadi kata-katanya ada di dalam komentar dan pemeriksaan mentah akan
  // menandai penjelasannya sendiri sebagai pelanggaran.
  const migrationCode = migration
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i.test(migrationCode),
    'ADD COLUMN IF NOT EXISTS tidak didukung MySQL 8.4 — deploy akan gagal');
  assert.match(migrationCode, /INFORMATION_SCHEMA\.COLUMNS/, 'migrasi harus mengecek kolom dulu');
  assert.match(migrationCode, /PREPARE\s+stmt\s+FROM\s+@ddl/, 'ALTER lewat prepared statement');
});

test('mata 5 — backend: nilai naik config_version supaya terkirim ke kiosk', () => {
  const model = read(path.join(backend, 'models', 'kioskPrintingConfigModel.js'));
  // Kalau penyesuaian tidak masuk daftar `unchanged`, mengubah brightness saja
  // akan dianggap "tidak ada perubahan": config_version tidak naik, dan kiosk
  // tidak pernah menerima nilai baru.
  const unchangedBlock = model.match(/const unchanged = \[([\s\S]*?)\]/);
  assert.ok(unchangedBlock, 'blok `unchanged` harus ada');
  for (const field of FIELDS) {
    assert.ok(unchangedBlock[1].includes(field),
      `${field} harus ikut dicek di \`unchanged\`, kalau tidak perubahan tidak terkirim`);
  }
});

test('mata 6 — backend: payload socket memuat nilai kalibrasi', () => {
  const { toSocketPrintingConfig } = require('../utils/printingConfigValidation');
  const payload = toSocketPrintingConfig({
    printing_enabled: 1, adapter: 'thermal', printer_name: 'B1 Pro',
    paper_size: 'CUSTOM 54X67 MM', orientation: 'portrait', copies_limit: 1,
    timeout_ms: 60000, retry_count: 2, config_version: 3, allowed_layouts: '[]',
    photo_brightness: 112, photo_contrast: 108, photo_saturation: 95,
    thermal_density: 4, thermal_offset_y_px: -6, photo_fit_mode: 'fit',
  });
  assert.strictEqual(payload.photo_brightness, 112);
  assert.strictEqual(payload.photo_contrast, 108);
  assert.strictEqual(payload.photo_saturation, 95);
  assert.strictEqual(payload.thermal_density, 4);
  assert.strictEqual(payload.thermal_offset_y_px, -6);
  assert.strictEqual(payload.photo_fit_mode, 'fit');
});

test('mata 7 — agent: reportedState diperbarui (titik yang pernah jadi bug)', () => {
  const ws = read(path.join(agent, 'wsClient.js'));
  // Nilai harus masuk reportedState, bukan hanya printerConfig. Photobooth
  // membaca reportedState lewat local bridge.
  assert.match(ws, /this\.reportedState[\s\S]{0,900}?photoBrightness/,
    'photoBrightness harus ikut dilaporkan lewat reportedState');
  assert.match(ws, /Object\.assign\(this\.reportedState,\s*calib\)/,
    'nilai kalibrasi harus di-assign ke reportedState');
  // Dan juga tersimpan di printerConfig untuk keperluan cetak.
  assert.match(ws, /photoBrightness:\s*Number\(config\.photo_brightness/,
    'printerConfig harus mengambil nilai dari payload backend');
  // Nilai awal harus ada di reportedState, supaya sambungan pertama tidak kosong.
  assert.match(ws, /reportedState = \{[\s\S]{0,600}?thermalDensity:/,
    'reportedState awal harus memuat nilai kalibrasi');
});

test('mata 8 — photobooth: state menerima nilai dari bridge', () => {
  const bridge = read(path.join(photobooth, 'services', 'kioskAgentBridge.ts'));
  for (const camel of ['photoBrightness', 'photoContrast', 'photoSaturation', 'thermalDensity', 'thermalOffsetYPx', 'photoFitMode']) {
    assert.ok(bridge.includes(camel), `KioskAgentState harus punya ${camel}`);
  }
  const booth = read(path.join(photobooth, 'components', 'PhotoBooth.tsx'));
  assert.match(booth, /agentState\.photoBrightness/, 'PhotoBooth harus membaca nilainya dari agent');
  assert.match(booth, /setPhotoAdjust\(/, 'nilai harus masuk state supaya bisa dipakai render');
});

test('mata 9 — photobooth: nilai BENAR-BENAR dipakai saat menggambar foto', () => {
  const booth = read(path.join(photobooth, 'components', 'PhotoBooth.tsx'));
  // Disimpan tetapi tidak dipakai = Admin terlihat berhasil tanpa efek.
  assert.match(booth, /brightness\(\$\{photoAdjust\.brightness\}%\)/,
    'brightness harus masuk ke filter canvas');
  assert.match(booth, /contrast\(\$\{photoAdjust\.contrast\}%\)/,
    'contrast harus masuk ke filter canvas');
  assert.match(booth, /saturate\(\$\{photoAdjust\.saturation\}%\)/,
    'saturasi harus masuk ke filter canvas');
});

test('mata 10 — filter pengguna dan penyesuaian Admin TIDAK saling menimpa', () => {
  const booth = read(path.join(photobooth, 'components', 'PhotoBooth.tsx'));
  // `ctx.filter` hanya menerima satu nilai. Menulisnya dua kali berarti efek
  // pertama hilang tanpa peringatan.
  const filterWrites = booth.match(/ctx\.filter\s*=/g) || [];
  const combined = /\[userFilter, adminAdjust\]\.filter\(Boolean\)\.join\(' '\)/;
  assert.match(booth, combined, 'kedua filter harus digabung jadi satu string');
  assert.ok(filterWrites.length >= 2, 'canvas filter tetap dipakai di jalur lain (mis. OCR)');
  // Jalur OCR TIDAK boleh ikut berubah: filter struk sudah dikalibrasi agar
  // nominal terbaca, dan merusaknya akan mematikan verifikasi pembayaran.
  assert.match(booth, /contrast\(1\.24\) brightness\(1\.04\) saturate\(0\.9\)/,
    'filter OCR struk harus tetap seperti semula');
});

test('mata 11 — jalur OCR tidak memakai state Admin', () => {
  const booth = read(path.join(photobooth, 'components', 'PhotoBooth.tsx'));
  const ocrFn = booth.match(/captureFrameCandidate[\s\S]*?\n  \}, \[\]\);/);
  assert.ok(ocrFn, 'fungsi captureFrameCandidate harus ditemukan');
  assert.ok(!ocrFn[0].includes('photoAdjust'),
    'jalur OCR struk tidak boleh memakai photoAdjust — itu akan merusak verifikasi pembayaran');
});

test('mata 12 — local bridge meneruskan state apa adanya', () => {
  const lb = read(path.join(agent, 'localBridge.js'));
  // Bridge mengirim this.currentState utuh; kalau suatu saat ia memfilter
  // field, nilai kalibrasi akan hilang di perjalanan.
  assert.match(lb, /data:\s*this\.currentState/, 'kiosk-status harus mengirim state utuh');
  assert.match(lb, /broadcastState/, 'harus ada siaran perubahan ke photobooth');
});
