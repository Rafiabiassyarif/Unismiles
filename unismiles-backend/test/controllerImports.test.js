const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const controllerPath = path.join(__dirname, '..', 'controllers', 'paymentVerificationController.js');
const source = fs.readFileSync(controllerPath, 'utf8');

/**
 * Bug nyata di produksi: controller memanggil decideVerification() tetapi
 * require-nya tidak pernah tertulis. Akibatnya setiap verifikasi pembayaran
 * gagal dengan "ReferenceError: decideVerification is not defined", tersimpan
 * sebagai INTERNAL_ERROR.
 *
 * Kesalahan seperti ini tidak kelihatan saat membaca diff — hanya ketahuan saat
 * fungsi itu benar-benar dipanggil. Jadi diperiksa di sini.
 */
test('decideVerification diimpor DAN dipakai', () => {
  assert.match(
    source,
    /require\(['"]\.\.\/utils\/paymentDecision['"]\)/,
    'controller harus mengimpor modul keputusan'
  );
  assert.match(source, /decideVerification\s*\(/, 'controller harus memanggilnya');
  assert.ok(
    fs.existsSync(path.join(__dirname, '..', 'utils', 'paymentDecision.js')),
    'modul keputusan harus ada'
  );
});

test('nama dari modul keputusan benar-benar diekspor', () => {
  const mod = require('../utils/paymentDecision');
  assert.strictEqual(typeof mod.decideVerification, 'function',
    'decideVerification harus diekspor sebagai fungsi');
});

// Modul itu sendiri harus bisa dimuat dan menjalankan aturan intinya, supaya
// kesalahan tulis nama tertangkap sebelum sampai produksi.
test('modul keputusan berjalan pada kasus nominal cocok', () => {
  const { decideVerification } = require('../utils/paymentDecision');
  const hasil = decideVerification({
    expectedAmount: 5087,
    extractedAmount: 5087,
    extractedStatus: 'pending',
    qualityScore: 0.2,
    screenType: 'receipt_detail',
    strictMatch: true,
  });
  assert.strictEqual(hasil.decision, 'verified');
});

test('tidak ada variabel lama yang tertinggal tanpa definisi', () => {
  // paymentClearlyProven sudah dipindahkan ke modul keputusan.
  assert.ok(
    !/paymentClearlyProven/.test(source),
    'sisa referensi lama akan jadi ReferenceError seperti bug produksi'
  );
});

test('fungsi lama yang sudah dipindah tidak lagi dipanggil di controller', () => {
  // matchMerchant sekarang diserahkan ke modul keputusan lewat parameter.
  const calls = (source.match(/matchMerchant\(/g) || []).length;
  assert.ok(calls >= 1, 'matchMerchant masih dipakai untuk memberi tahu modul keputusan');
  assert.ok(!/hasConfiguredMerchant/.test(source),
    'variabel lama dari jalur keputusan harus sudah hilang');
});
