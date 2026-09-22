const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Rantai status printer: browser -> backend -> panel Admin.
 *
 * Kenapa perlu diuji: printer label NIIMBOT tersambung lewat Web Bluetooth dan
 * TIDAK muncul sebagai printer sistem, jadi kiosk-agent tidak bisa melaporkannya.
 * Kalau jalur ini putus di mana pun, panel Admin akan selamanya menampilkan
 * status kosong — dan tidak ada error di mana pun yang menjelaskannya.
 */

const backend = path.join(__dirname, '..');
const repo = path.join(backend, '..');
const read = (p) => fs.readFileSync(p, 'utf8');

test('browser melaporkan status ke endpoint kiosk', () => {
  const printer = read(path.join(repo, 'unismiles-photobooth', 'services', 'niimbotPrinter.ts'));
  assert.match(printer, /kiosk\/printer-status/, 'harus memanggil endpoint laporan');
  assert.match(printer, /'x-api-key':\s*apiKey/, 'harus memakai kunci kiosk');
  assert.match(printer, /void this\.reportStatus\('READY'/, 'sambungan berhasil harus dilaporkan');
});

test('kegagalan pelaporan status tidak menggagalkan cetak', () => {
  const printer = read(path.join(repo, 'unismiles-photobooth', 'services', 'niimbotPrinter.ts'));
  // Status hanya informasi bagi Admin; label yang tidak tercetak adalah
  // kerugian nyata. Jadi pelaporan tidak boleh di-await di jalur cetak.
  assert.match(printer, /void this\.reportStatus/, 'pelaporan tidak boleh di-await di jalur sambung');
  assert.match(printer, /catch \{\s*\/\/ Sengaja ditelan/,
    'kegagalan pelaporan harus ditelan, bukan dilempar');
});

test('endpoint laporan memakai auth kiosk', () => {
  const routes = read(path.join(backend, 'routes', 'v1', 'kioskRoutes.js'));
  assert.match(routes, /router\.post\('\/printer-status'/, 'endpoint harus terdaftar');
  // Seluruh router sudah memakai verifyApiKey; pastikan masih begitu.
  assert.match(routes, /router\.use\(verifyApiKey\)/,
    'seluruh route kiosk harus tetap memakai auth');
});

test('laporan dari browser tidak bisa menulis selain status printer', () => {
  const ctrl = read(path.join(backend, 'controllers', 'printingConfigController.js'));
  // Endpoint ini memakai kunci kiosk. Kalau ia menerima field bebas, browser
  // (atau apa pun yang memegang kunci) bisa mengubah konfigurasi cetak.
  const fn = ctrl.match(/async reportFromBrowser[\s\S]*?\n  \},/);
  assert.ok(fn, 'reportFromBrowser harus ada');
  const body = fn[0];
  assert.match(body, /body\.status/, 'membaca status');
  assert.match(body, /body\.printer_name/, 'membaca nama printer');
  assert.ok(!/validatePrintingConfig/.test(body),
    'tidak boleh memakai validator konfigurasi — itu untuk perubahan pengaturan, bukan laporan status');
  assert.ok(!/body\.adapter|body\.paper_size|body\.density/.test(body),
    'tidak boleh menerima field konfigurasi dari browser');
});

test('status yang tidak dikenal ditolak, bukan disimpan apa adanya', () => {
  const ctrl = read(path.join(backend, 'controllers', 'printingConfigController.js'));
  const fn = ctrl.match(/async reportFromBrowser[\s\S]*?\n  \},/)[0];
  assert.match(fn, /ALLOWED_STATUS = \['READY', 'OFFLINE', 'ERROR', 'UNKNOWN'\]/,
    'harus ada daftar status yang sah');
  assert.match(fn, /must be one of/, 'nilai di luar daftar harus ditolak dengan pesan jelas');
});

test('laporan masuk ke kolom reported_* yang dibaca panel Admin', () => {
  const ctrl = read(path.join(backend, 'controllers', 'printingConfigController.js'));
  const fn = ctrl.match(/async reportFromBrowser[\s\S]*?\n  \},/)[0];
  assert.match(fn, /updateReported/, 'harus memakai updateReported');
  assert.match(fn, /config_version:\s*current\.config\.config_version/,
    'versi konfigurasi harus sama, kalau tidak panel menandai status salah');

  // Panel Admin membaca `reported`; pastikan bentuknya memang tersedia.
  const model = read(path.join(backend, 'models', 'kioskPrintingConfigModel.js'));
  assert.match(model, /reported_printer_name/, 'model harus membaca nama printer yang dilaporkan');
  assert.match(model, /reported_status/, 'model harus membaca status yang dilaporkan');
});

test('panel Admin menampilkan status printer yang dilaporkan', () => {
  const panel = read(path.join(repo, 'unismiles-admin', 'src', 'components', 'PrinterConfiguration.tsx'));
  assert.match(panel, /reported\?\.status/, 'panel harus menampilkan status');
  assert.match(panel, /reported\?\.printer_name/, 'panel harus menampilkan nama printer');
  assert.match(panel, /reported\?\.paper_status/, 'panel harus menampilkan status kertas');
});

test('pelaporan gagal secara diam saat kunci tidak ada', () => {
  const printer = read(path.join(repo, 'unismiles-photobooth', 'services', 'niimbotPrinter.ts'));
  // Tanpa kunci, jangan mengirim apa pun: mencetak dengan kredensial salah lebih
  // buruk daripada tidak ada status di Admin.
  assert.match(printer, /if \(!apiKey \|\| !baseUrl\) return;/,
    'harus berhenti diam-diam kalau kunci/URL tidak tersedia');
});

test('endpoint kiosk mengirim SEMUA field kalibrasi, bukan sebagian', () => {
  // Kegagalan nyata: thermal_offset_x_px tersimpan di DB dan diteruskan lewat
  // socket + model, tetapi TIDAK ada di respons GET /kiosk/printing-config.
  // Photobooth membaca dari endpoint itu, jadi nilai kalibrasi mendatar
  // diam-diam tidak pernah sampai — Admin terlihat tersimpan tanpa efek.
  //
  // Daftar field diturunkan dari PHOTO_ADJUST_LIMITS supaya menambah kolom baru
  // tanpa menambahkannya ke respons akan GAGAL di sini, bukan di kertas.
  const fs = require('node:fs');
  const path = require('node:path');
  const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'printingConfigController.js'), 'utf8');
  const { PHOTO_ADJUST_LIMITS } = require('../utils/printingConfigValidation');

  const badan = ctrl.slice(ctrl.indexOf('getForKiosk'));
  const hilang = Object.keys(PHOTO_ADJUST_LIMITS).filter(k => !new RegExp('\\b' + k + '\\s*:').test(badan));
  assert.deepStrictEqual(hilang, [],
    'field kalibrasi ini tidak dikirim ke photobooth: ' + hilang.join(', '));
});
