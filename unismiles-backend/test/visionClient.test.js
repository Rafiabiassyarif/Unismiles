const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const {
  pickVisionUrl, normalizeUrl, resolveVisionServiceUrl, DEFAULT_VISION_URL,
} = require(path.join(__dirname, '..', 'utils', 'visionClient.js'));

// Di produksi, .env site root kehilangan PAYMENT_VISION_SERVICE_URL sehingga
// backend menembak localhost:5001 — alamat yang tidak ada di server — dan setiap
// verifikasi pembayaran berakhir INTERNAL_ERROR walau vision service sehat di
// domain publiknya. Cadangan domain publik mencegah kegagalan total itu.
test('tanpa konfigurasi apa pun, tidak jatuh ke localhost yang tidak ada', () => {
  const url = pickVisionUrl([]);
  assert.strictEqual(url, DEFAULT_VISION_URL);
  assert.ok(!/localhost|127\.0\.0\.1/.test(url), `dapat ${url}`);
});

test('alamat loopback ditolak di port berapa pun', () => {
  // Loopback terisolasi per-site di server, jadi ini selalu salah.
  assert.strictEqual(pickVisionUrl(['http://localhost:5001']), DEFAULT_VISION_URL);
  assert.strictEqual(pickVisionUrl(['http://127.0.0.1:5013']), DEFAULT_VISION_URL);
  assert.strictEqual(pickVisionUrl(['http://localhost:5018']), DEFAULT_VISION_URL);
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
  assert.strictEqual(resolveVisionServiceUrl({}), DEFAULT_VISION_URL);
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
