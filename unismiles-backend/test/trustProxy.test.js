const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const authRoutes = fs.readFileSync(
  path.join(__dirname, '..', 'routes', 'v1', 'authRoutes.js'), 'utf8'
);
const securitySource = fs.readFileSync(
  path.join(__dirname, '..', 'utils', 'security.js'), 'utf8'
);

// Aplikasi berjalan di belakang proxy web server. Tanpa 'trust proxy', req.ip
// berisi alamat proxy untuk semua pengunjung, jadi SATU bucket rate limit
// dipakai bersama. Akibatnya login salah password beberapa kali oleh satu orang
// mengunci halaman login untuk semua orang.
test('trust proxy diset agar rate limit per pengunjung, bukan per proxy', () => {
  assert.match(serverSource, /app\.set\(\s*'trust proxy'\s*,\s*1\s*\)/,
    "server.js harus memanggil app.set('trust proxy', 1)");
});

test('trust proxy dipasang, bukan dihapus', () => {
  assert.ok(!/app\.set\(\s*'trust proxy'\s*,\s*false\s*\)/.test(serverSource),
    'trust proxy tidak boleh dimatikan');
});

// Urutan penting: bila limiter berjalan sebelum trust proxy, req.ip sudah
// terlanjur berisi IP proxy.
test('trust proxy diset sebelum limiter /api dipasang', () => {
  const trustIdx = serverSource.indexOf("app.set('trust proxy'");
  const limiterIdx = serverSource.indexOf('app.use(\'/api/\', apiLimiter)');
  assert.ok(trustIdx > -1, 'trust proxy harus ada');
  assert.ok(limiterIdx > -1, 'apiLimiter harus dipasang');
  assert.ok(trustIdx < limiterIdx, 'trust proxy harus lebih dulu daripada limiter');
});

test('trust proxy diset sebelum route auth dimuat', () => {
  const trustIdx = serverSource.indexOf("app.set('trust proxy'");
  const authIdx = serverSource.indexOf("app.use('/api/v1/auth'");
  assert.ok(trustIdx > -1 && authIdx > -1);
  assert.ok(trustIdx < authIdx, 'trust proxy harus lebih dulu daripada route auth');
});

test('limit login tetap ada dan masuk akal', () => {
  // windowMs boleh berupa ekspresi (mis. 15 * 60_000), jadi hanya ambil nilainya.
  const match = authRoutes.match(/router\.post\('\/login',\s*createRateLimiter\(\{([^}]*)\}/);
  assert.ok(match, 'limit login harus tetap terpasang pada route login');
  const maxMatch = match[1].match(/max:\s*(\d+)/);
  const windowMatch = match[1].match(/windowMs:\s*([^,]+)/);
  assert.ok(maxMatch && windowMatch, 'windowMs dan max harus ada');
  const max = Number(maxMatch[1]);
  const windowMs = eval(windowMatch[1].replace(/_/g, '')); // eslint-disable-line no-eval
  assert.ok(max >= 5, `jangan terlalu ketat sampai mengganggu login normal, dapat ${max}`);
  assert.ok(max <= 100, `tetap harus membatasi percobaan, dapat ${max}`);
  assert.ok(windowMs >= 60_000, `jendela minimal 1 menit, dapat ${windowMs}`);
});

// Pesan 429 harus membawa retry_after_seconds supaya klien bisa memberi tahu
// pengguna berapa lama harus menunggu.
test('respons 429 menyertakan retry_after_seconds', () => {
  assert.match(securitySource, /retry_after_seconds/, 'klien butuh lama tunggu');
  assert.match(securitySource, /res\.set\('Retry-After'/, 'header Retry-After harus dikirim');
});
