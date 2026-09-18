const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'controllers', 'paymentVerificationController.js'),
  'utf8'
);

// Pemindaian sekarang otomatis saat halaman pembayaran terbuka. Kalau batas
// percobaan tetap 3, satu pengiriman otomatis memakan sepertiga jatah dan
// pengunjung hampir tidak punya kesempatan mencoba ulang.
test('batas percobaan scan dinaikkan untuk pemindaian otomatis', () => {
  const match = source.match(/const MAX_SCAN_ATTEMPTS = (\d+);/);
  assert.ok(match, 'batas harus didefinisikan sebagai konstanta bernama');
  const limit = Number(match[1]);
  assert.ok(limit >= 6, `batas minimal 6 untuk auto-scan, dapat ${limit}`);
  assert.ok(limit <= 20, `batas harus tetap membatasi penyalahgunaan, dapat ${limit}`);
});

test('batas tetap ditegakkan, bukan dihapus', () => {
  assert.match(source, /if \(attemptCount >= MAX_SCAN_ATTEMPTS\)/, 'pemeriksaan batas harus ada');
  assert.match(source, /status\(429\)/, 'harus menjawab 429 saat batas tercapai');
});

// Pengaman anti-pemakaian-ulang dan validasi nominal tidak boleh ikut longgar.
test('validasi inti pembayaran tidak dilonggarkan', () => {
  assert.match(source, /DUPLICATE_REFERENCE/, 'pengaman anti-replay harus tetap ada');
  assert.match(source, /AMOUNT_MISMATCH/, 'validasi nominal harus tetap ada');
  assert.match(source, /payment_status === 'verified'/, 'sesi yang sudah lunas harus ditolak ulang');
});
