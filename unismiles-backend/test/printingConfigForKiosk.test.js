/**
 * Test jalur pengaturan cetak TANPA kiosk-agent.
 *
 * Masalah yang dijaga di sini: konfigurasi cetak dulu hanya sampai ke kiosk
 * lewat WebSocket, yang butuh kiosk-agent berjalan. Photobooth yang mencetak
 * langsung lewat Web Bluetooth tidak punya jalur lain, jadi ukuran kertas,
 * kepekatan, dan geser vertikal dari Admin praktis tidak bisa dipakai — dan
 * di halaman uji ketiganya readonly, sehingga tidak ada tempat untuk
 * mengubahnya sama sekali.
 *
 * Diperbaiki dengan endpoint HTTP `GET /kiosk/printing-config` untuk kiosk, dan
 * halaman uji membaca backend lebih dulu, agent sebagai cadangan.
 */

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const backend = path.join(__dirname, '..');
const repo = path.join(backend, '..');
const read = (p) => fs.readFileSync(p, 'utf8');

test('kiosk bisa membaca pengaturan cetak lewat HTTP, tanpa agent', () => {
  const routes = read(path.join(backend, 'routes', 'v1', 'kioskRoutes.js'));
  assert.match(routes, /router\.get\('\/printing-config'/, 'endpoint harus terdaftar');
  assert.match(routes, /router\.use\(verifyApiKey\)/, 'seluruh route kiosk tetap memakai auth');

  const ctrl = read(path.join(backend, 'controllers', 'printingConfigController.js'));
  assert.match(ctrl, /async getForKiosk\(/, 'handler harus ada');
});

test('endpoint kiosk hanya MEMBACA, tidak bisa mengubah konfigurasi', () => {
  const ctrl = read(path.join(backend, 'controllers', 'printingConfigController.js'));
  const fn = ctrl.match(/async getForKiosk[\s\S]*?\n  \},/)[0];
  // Kiosk boleh membaca; mengubah tetap hanya lewat Admin.
  assert.ok(!/updateDesired/.test(fn), 'kiosk tidak boleh mengubah konfigurasi');
  assert.ok(!/validatePrintingConfig/.test(fn), 'bukan jalur perubahan');
  assert.match(fn, /printingConfigModel\.format/, 'harus memakai format yang sama dengan Admin');
});

test('nilai yang dibutuhkan untuk mencetak ikut dikembalikan', () => {
  const ctrl = read(path.join(backend, 'controllers', 'printingConfigController.js'));
  const fn = ctrl.match(/async getForKiosk[\s\S]*?\n  \},/)[0];
  // Kalau salah satu hilang, photobooth akan memakai nilai netral tanpa
  // penjelasan — persis gejala "pengaturan tidak bisa diakses".
  for (const f of ['paper_size', 'thermal_density', 'thermal_offset_y_px', 'photo_fit_mode',
                   'photo_brightness', 'photo_contrast', 'photo_saturation']) {
    assert.match(fn, new RegExp(f + ':'), `${f} harus ikut dikembalikan`);
  }
});

test('endpoint kiosk tidak membocorkan apa pun yang sensitif', () => {
  const ctrl = read(path.join(backend, 'controllers', 'printingConfigController.js'));
  const fn = ctrl.match(/async getForKiosk[\s\S]*?\n  \},/)[0];
  assert.ok(!/api_key/.test(fn), 'kunci kiosk tidak boleh ikut');
  assert.ok(!/available_printers/.test(fn), 'daftar printer tidak perlu untuk kiosk sendiri');
  assert.ok(!/supported_adapters/.test(fn), 'daftar adapter internal agent tidak perlu');
});

test('halaman uji membaca backend dulu, agent sebagai cadangan', () => {
  const page = read(path.join(repo, 'unismiles-photobooth', 'niimbot-test.html'));
  // Urutan ini yang membuat agent tidak lagi wajib.
  assert.match(page, /readBackend\(\)\s*\n\s*\.catch\(function \(\) \{ asal = 'agent'; return readAgent\(\); \}\)/,
    'backend harus dicoba lebih dulu, agent menjadi cadangan');
  assert.match(page, /\/kiosk\/printing-config/, 'memanggil endpoint kiosk');
  assert.match(page, /localStorage\.getItem\('pb_config'\)/,
    'memakai konfigurasi yang sama dengan photobooth');
});

test('asal nilai dikatakan, supaya tidak menyesatkan', () => {
  const page = read(path.join(repo, 'unismiles-photobooth', 'niimbot-test.html'));
  assert.match(page, /lewat kiosk-agent/, 'kalau dari agent, harus dikatakan');
  assert.match(page, /tidak bisa dibaca/, 'kalau kedua sumber mati, harus dikatakan');
  // Dua bentuk data berbeda: backend snake_case, agent camelCase.
  assert.match(page, /function fromBackend/, 'backend perlu pemetaan sendiri');
  assert.match(page, /function fromAgent/, 'agent perlu pemetaan sendiri');
});

test('kunci kiosk tidak pernah ditulis ke berkas halaman', () => {
  const page = read(path.join(repo, 'unismiles-photobooth', 'niimbot-test.html'));
  // Halaman hanya membaca dari localStorage/env; tidak boleh ada kunci harfiah.
  assert.ok(!/kiosk_[0-9a-f]{16,}/.test(page), 'tidak boleh ada kunci kiosk harfiah di halaman');
  assert.match(page, /localStorage|__KIOSK_API_KEY__/, 'harus diambil saat runtime');
});
