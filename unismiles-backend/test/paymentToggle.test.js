/**
 * Test jalur uji tanpa pembayaran.
 *
 * Yang dijaga di sini penting: mematikan pembayaran untuk uji TIDAK BOLEH menjadi
 * bypass keamanan. Yang berubah hanya dua hal —
 *   1. sesi baru ditandai 'verified' di database, dan
 *   2. layar bayar dilewati di photobooth.
 * Penjagaan di endpoint upload dan cetak harus tetap menolak sesi yang belum
 * dibayar. Kalau suatu saat penjagaan itu ikut dilewati, test ini gagal.
 */

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const backend = path.join(__dirname, '..');
const repo = path.join(backend, '..');
const read = (p) => fs.readFileSync(p, 'utf8');

const session = read(path.join(backend, 'controllers', 'sessionController.js'));
const printJob = read(path.join(backend, 'controllers', 'printJobController.js'));

test('flag dibaca dari data yang sudah ada, bukan tabel/kolom baru', () => {
  // Tanpa tabel baru berarti membalikkannya cukup satu UPDATE, dan tidak ada
  // migrasi yang harus diingat saat mengembalikan.
  assert.match(session, /let paymentRequired = true;/,
    'bawaannya WAJIB true: aman kalau data tidak terbaca');
  assert.match(session, /paymentRequired = pData\.payment_required !== false;/,
    'dibaca dari payment_profiles.payment_data');
  // Bawaan true itu penting: profil tanpa flag, atau JSON rusak, harus tetap
  // menuntut pembayaran.
  assert.match(session, /catch \(e\) \{\}/, 'JSON rusak tidak boleh mematikan pembayaran');
});

test('sesi ditandai verified hanya saat flag dimatikan', () => {
  assert.match(session, /paymentRequired \? 'pending' : 'verified'/,
    'status di database mengikuti flag, bukan selalu pending');
  // Dan status itu benar-benar dipakai di query, bukan cuma dihitung.
  assert.match(session, /UPDATE sessions SET\s+payment_status = \?/,
    'status harus di-bind ke query, bukan ditulis harfiah');
});

test('respons memberi tahu photobooth supaya layar bayar bisa dilewati', () => {
  assert.match(session, /payment_required: paymentRequired/,
    'flag harus ada di respons startSession');
  const api = read(path.join(repo, 'unismiles-photobooth', 'services', 'apiService.ts'));
  assert.match(api, /payment_required: \(data\.data as any\)\?\.payment_required !== false/,
    'apiService harus meneruskan flag dari respons');
});

test('photobooth melewati layar bayar TANPA melewati penjagaan lain', () => {
  const booth = read(path.join(repo, 'unismiles-photobooth', 'components', 'PhotoBooth.tsx'));
  assert.match(booth, /if \(sessionData\.payment_required === false\) \{\s+setVerificationStatus\('verified'\);\s+setStep\('CAPTURE'\);\s+\} else \{\s+setStep\('PAYMENT'\);\s+\}/,
    'harus bercabang ke CAPTURE hanya saat flag false, dan tetap ke PAYMENT selainnya');
});

test('penjagaan cetak TIDAK ikut dilonggarkan', () => {
  // Ini bagian terpenting: mematikan pembayaran untuk uji bukan bypass.
  // Sesi dibuat berstatus 'verified', jadi penjagaan ini tetap berlaku apa adanya.
  assert.match(printJob, /if \(session\.payment_status !== 'verified'\)/,
    'cetak harus tetap menolak sesi yang belum dibayar');
  assert.match(printJob, /PAYMENT_REQUIRED/, 'harus tetap ada kode error yang jelas');
});

test('penjagaan upload TIDAK ikut dilonggarkan', () => {
  // Endpoint unggah foto juga menuntut pembayaran terverifikasi; itu tidak
  // disentuh oleh perubahan ini.
  const uploadGuard = /payment_status !== 'verified'/g;
  const total = (session.match(uploadGuard) || []).length
    + (read(path.join(backend, 'controllers', 'photoController.js')).match(uploadGuard) || []).length;
  assert.ok(total >= 1, 'penjagaan pembayaran harus tetap ada di jalur unggah/sesi');
});

test('tidak ada jalur lain yang MENULIS status verified', () => {
  // Yang dicari hanya penulisan: `SET ... payment_status = 'nilai'` pada SATU
  // baris. Pembacaan (WHERE payment_status = 'pending') memang wajar ada, dan
  // menandai sesi kedaluwarsa ('expired') bukan bypass.
  // Catatan: regex `[^`]*` akan menyeberang baris dan salah menangkap WHERE,
  // jadi pola ini sengaja dibatasi ke satu baris.
  const penulisan = session.match(/SET[ \t]+payment_status[ \t]*=[ \t]*'(verified|pending)'/g) || [];
  assert.strictEqual(penulisan.length, 0,
    `status harus lewat binding, ditemukan: ${JSON.stringify(penulisan)}`);
  // Dan penulisan status pada sesi baru memang memakai binding.
  assert.match(session, /SET\s+payment_status = \?/, 'penulisan status harus lewat binding');
});
