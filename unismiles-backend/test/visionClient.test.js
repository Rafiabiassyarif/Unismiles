const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const {
  pickVisionUrl, normalizeUrl, resolveVisionServiceUrl, resolveVisionCandidates,
} = require(path.join(__dirname, '..', 'utils', 'visionClient.js'));

// Alamat cadangan sekarang berupa daftar host:port, bukan satu URL tetap, karena
// port vision service BERUBAH setiap deploy (pernah 5013, lalu 5025). Satu URL
// mati berarti pembayaran mati, jadi client mencoba beberapa port.
const FALLBACK = pickVisionUrl([]);

// Di produksi, .env site root kehilangan PAYMENT_VISION_SERVICE_URL sehingga
// backend menembak localhost:5001 — alamat yang tidak ada di server — dan setiap
// verifikasi pembayaran berakhir INTERNAL_ERROR walau vision service sehat di
// domain publiknya. Cadangan domain publik mencegah kegagalan total itu.
test('tanpa konfigurasi apa pun, tidak jatuh ke localhost yang tidak ada', () => {
  const url = pickVisionUrl([]);
  assert.strictEqual(url, FALLBACK);
  assert.ok(!/localhost|127\.0\.0\.1/.test(url), `dapat ${url}`);
});

test('alamat loopback ditolak di port berapa pun', () => {
  // Loopback terisolasi per-site di server, jadi ini selalu salah.
  assert.strictEqual(pickVisionUrl(['http://localhost:5001']), FALLBACK);
  assert.strictEqual(pickVisionUrl(['http://127.0.0.1:5013']), FALLBACK);
  assert.strictEqual(pickVisionUrl(['http://localhost:5018']), FALLBACK);
});

test('alamat sah dipakai apa adanya', () => {
  assert.strictEqual(
    pickVisionUrl(['https://payment-vision-node.uniinside.net']),
    'https://payment-vision-node.uniinside.net',
  );
});

test('kandidat pertama yang terisi menang', () => {
  assert.strictEqual(
    pickVisionUrl(['', '   ', 'https://kedua.example.com', 'https://ketiga.example.com']),
    'https://kedua.example.com',
  );
});

test('garis miring di akhir dibersihkan agar tidak jadi //process', () => {
  assert.strictEqual(normalizeUrl('https://vision.example.com///'), 'https://vision.example.com');
});

test('spasi berlebih di sekitar nilai diabaikan', () => {
  assert.strictEqual(normalizeUrl('  https://vision.example.com  '), 'https://vision.example.com');
});

test('resolveVisionServiceUrl membaca beberapa nama variabel', () => {
  assert.strictEqual(
    resolveVisionServiceUrl({ VISION_SERVICE_URL: 'https://alias.example.com' }),
    'https://alias.example.com',
  );
  assert.strictEqual(
    resolveVisionServiceUrl({ PAYMENT_VISION_URL: 'https://ketiga.example.com' }),
    'https://ketiga.example.com',
  );
  assert.strictEqual(resolveVisionServiceUrl({}), FALLBACK);
});

test('nama utama diutamakan atas alias', () => {
  assert.strictEqual(
    resolveVisionServiceUrl({
      PAYMENT_VISION_SERVICE_URL: 'https://utama.example.com',
      VISION_SERVICE_URL: 'https://alias.example.com',
    }),
    'https://utama.example.com',
  );
});

test('klien mengekspos alamat yang sedang dipakai', () => {
  const mod = require(path.join(__dirname, '..', 'utils', 'visionClient.js'));
  assert.strictEqual(typeof mod.baseUrl, 'string');
  assert.ok(mod.baseUrl.startsWith('http'), `dapat ${mod.baseUrl}`);
});

// ---------------------------------------------------------------------------
// Port vision service berubah setiap deploy (5013 -> 5025). Kalau client hanya
// memakai satu alamat, satu deploy ulang mematikan pembayaran sampai .env
// diperbarui manual — itu yang terjadi di produksi.
// ---------------------------------------------------------------------------

test('beberapa port dicoba, bukan hanya satu', () => {
  const urls = resolveVisionCandidates({ PAYMENT_VISION_SERVICE_URL: 'http://192.168.100.185:5013' });
  assert.ok(urls.length >= 3, `harus ada cadangan port, dapat ${urls.length}`);
  assert.strictEqual(urls[0], 'http://192.168.100.185:5013', 'alamat dari env didahulukan');
  assert.ok(urls.includes('http://192.168.100.185:5025'), 'port 5025 harus ikut dicoba');
});

test('host dari env dipakai untuk semua port cadangan', () => {
  const urls = resolveVisionCandidates({ PAYMENT_VISION_SERVICE_URL: 'http://10.0.0.9:5013' });
  for (const url of urls) {
    assert.ok(url.startsWith('http://10.0.0.9:'), `host harus dari env: ${url}`);
  }
});

test('tanpa env, host bawaan tetap dipakai', () => {
  const urls = resolveVisionCandidates({});
  assert.ok(urls.length >= 3);
  assert.ok(urls.every((u) => !/localhost|127\.0\.0\.1/.test(u)), 'loopback selalu salah di server ini');
});

test('daftar kandidat tidak memuat duplikat', () => {
  const urls = resolveVisionCandidates({ PAYMENT_VISION_SERVICE_URL: 'http://192.168.100.185:5025' });
  assert.strictEqual(new Set(urls).size, urls.length, `ada duplikat: ${urls.join(', ')}`);
});
