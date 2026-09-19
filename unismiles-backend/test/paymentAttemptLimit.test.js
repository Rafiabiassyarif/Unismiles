const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'controllers', 'paymentVerificationController.js'),
  'utf8'
);

// Permintaan: pengunjung bebas scan berkali-kali. Batas 6 membuat mereka mentok
// di tengah jalan padahal bukti aslinya sah. Batas jumlah percobaan dimatikan;
// pengaman lain (ukuran unggahan, anti-replay, kedaluwarsa sesi, rate limit)
// tetap berlaku.
test('batas jumlah percobaan scan dimatikan secara default', () => {
  assert.match(source, /PAYMENT_MAX_SCAN_ATTEMPTS/, 'harus bisa diatur lewat env');
  assert.match(
    source,
    /Number\.isFinite\(envLimit\) && envLimit > 0 \? envLimit : 0/,
    'tanpa env yang sah, batasnya 0 (tanpa batas)'
  );
  assert.ok(
    !/MAX_SCAN_ATTEMPTS = 6/.test(source),
    'batas keras 6 tidak boleh dikembalikan'
  );
});

test('batas hanya ditegakkan kalau memang diaktifkan', () => {
  assert.match(source, /if \(MAX_SCAN_ATTEMPTS > 0 && attemptCount >= MAX_SCAN_ATTEMPTS\)/);
  assert.match(source, /status\(429\)/, 'jawaban 429 tetap ada untuk mode berbatas');
});

test('nomor percobaan tetap dihitung untuk pelacakan', () => {
  assert.match(source, /attempt_number: attemptNum/, 'nomor percobaan tetap dicatat');
  assert.match(source, /const attemptNum = attemptCount \+ 1/);
});

// Anti-replay TIDAK boleh ikut dimatikan: itu pengaman pemakaian ulang bukti.
test('anti-replay tetap berlaku walau batas percobaan dimatikan', () => {
  assert.match(source, /DUPLICATE_REFERENCE/, 'bukti yang sama tidak boleh dipakai dua kali');
  assert.match(source, /referenceHmac/, 'pemeriksaan nomor referensi harus tetap ada');
});

// Pengaman ukuran unggahan tetap ada supaya memori server aman.
test('batas ukuran unggahan tetap berlaku', () => {
  assert.match(source, /limits:\s*\{[^}]*fileSize/, 'ukuran berkas harus tetap dibatasi');
});
