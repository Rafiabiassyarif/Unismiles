const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(backendRoot, 'server.js'), 'utf8');
const controller = fs.readFileSync(
  path.join(backendRoot, 'controllers', 'sessionController.js'), 'utf8'
);
const example = fs.readFileSync(path.join(backendRoot, '.env.example'), 'utf8');

/**
 * Fitur kirim email mati di produksi karena SMTP_USER/SMTP_PASS tidak ada di .env
 * server. Kode pengirimnya sudah lengkap sejak awal — yang kurang konfigurasi.
 *
 * Dua hal yang harus tetap benar:
 *   1. .env server tidak boleh ditimpa oleh deploy. Karena itu kredensial
 *      diletakkan di unismiles-backend/.env (tidak ter-track git, .gitignore
 *      memuat ".env"), bukan di /.env site root yang ditulis ulang tiap deploy.
 *   2. Tiga variabel wajib produksi harus ada bersamaan — JWT_SECRET,
 *      PUBLIC_BASE_URL, CORS_ORIGINS. Menambah kredensial email ke berkas .env
 *      TANPA ketiganya membuat server crash-loop (pernah terjadi).
 */

test('.env.example mendokumentasikan semua variabel wajib produksi', () => {
  for (const key of ['JWT_SECRET', 'PUBLIC_BASE_URL', 'CORS_ORIGINS', 'SMTP_HOST',
                     'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) {
    assert.match(example, new RegExp(`^${key}=`, 'm'), `${key} harus ada di .env.example`);
  }
});

test('server menolak start kalau variabel wajib produksi kosong', () => {
  // Ini pengaman yang mengubah kesalahan konfigurasi jadi kegagalan yang jelas,
  // bukan perilaku aneh di runtime.
  assert.match(server, /JWT_SECRET must be at least 32 characters in production/);
  assert.match(server, /PUBLIC_BASE_URL must be an HTTPS URL in production/);
  assert.match(server, /CORS_ORIGINS must explicitly list trusted HTTPS origins/);
});

test('env dimuat dari dua berkas: root dulu, lalu lokal tanpa menimpa', () => {
  // Root /.env ditulis ulang deploy, jadi kredensial yang harus bertahan
  // diletakkan di unismiles-backend/.env. Urutan ini yang membuat keduanya
  // bekerja sama, bukan saling menimpa.
  assert.match(server, /dotenv\.config\(\{ path: path\.resolve\(__dirname, '\.\.\/\.env'\) \}\)/,
    'env tingkat site harus dimuat lebih dulu');
  assert.match(server, /dotenv\.config\(\{ path: path\.resolve\(__dirname, '\.env'\), override: false \}\)/,
    'env lokal harus dimuat setelahnya TANPA menimpa nilai yang sudah ada');
});

test('IPv4 diprioritaskan agar SMTP tidak gagal karena IPv6', () => {
  // Gejala nyata: EHOSTUNREACH ke alamat IPv6 Gmail. Tanpa ini, pengiriman email
  // gagal di jaringan yang tidak punya rute IPv6.
  assert.match(server, /dns\.setDefaultResultOrder\('ipv4first'\)/,
    'urutan hasil DNS harus ipv4first');
});

test('pengirim email membaca kredensial dari environment', () => {
  assert.match(controller, /process\.env/);
  assert.match(controller, /SMTP_USER/);
  assert.match(controller, /SMTP_PASS/);
  assert.match(controller, /isPlaceholder/, 'nilai contoh harus ditolak, bukan dipakai');
});

test('status konfigurasi dicetak saat start tanpa membocorkan rahasia', () => {
  assert.match(server, /\[Config\]/, 'ringkasan konfigurasi harus dicetak saat start');
  // Yang dicetak hanya "ada/tidak ada" — pastikan tidak ada nilai SMTP yang ikut.
  const configLine = server.split('\n').filter((l) => l.includes('[Config]')).join('\n');
  assert.ok(!/SMTP_PASS\s*\+|\+\s*process\.env\.SMTP_PASS/.test(configLine),
    'nilai rahasia tidak boleh dicetak ke log');
  assert.match(server, /emailReady/, 'status email harus disimpulkan dari ada/tidaknya kredensial');
});
