/**
 * Kegagalan menyimpan arsip bukti TIDAK boleh membatalkan verifikasi.
 *
 * Kejadian nyata 2026-09-25: folder `private_uploads` milik uid lain dengan mode
 * 0775, sedangkan proses backend berjalan sebagai uid berbeda. Setiap penulisan
 * arsip ditolak (`EACCES`). Karena penulisan itu berada di jalur utama SEBELUM
 * keputusan disimpan, satu kegagalan izin melempar ke blok catch dan seluruh
 * pemindaian berakhir INTERNAL_ERROR — padahal nominal sudah cocok dan OCR sudah
 * membaca buktinya. Pengunjung melihat "Layanan pemeriksaan bukti bayar sedang
 * bermasalah di server" padahal pembayarannya sah.
 *
 * Arsip bukti adalah pelengkap untuk tinjauan manual, bukan syarat keputusan.
 * Uji ini mengunci sifat itu.
 */

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const SUMBER = path.join(__dirname, '..', 'controllers', 'paymentVerificationController.js');
const kode = fs.readFileSync(SUMBER, 'utf8');

test('penulisan arsip bukti dibungkus try/catch', () => {
  // Cari blok penulisan arsip, lalu pastikan `writeFile` berada di dalam try.
  const i = kode.indexOf('evidence_${attemptId}.jpg');
  assert.ok(i > 0, 'blok penulisan arsip harus tetap ada');

  const sekitar = kode.slice(i - 400, i + 700);
  assert.match(sekitar, /try\s*\{/, 'penulisan arsip harus di dalam try');
  assert.match(sekitar, /catch\s*\(/, 'harus ada catch yang menangani kegagalan tulis');
  assert.match(sekitar, /await fs\.writeFile\(/, 'writeFile tetap dipanggil');
});

test('kegagalan arsip tetap melanjutkan ke penyimpanan keputusan', () => {
  // Keputusan (PaymentVerificationModel.update) harus berada SETELAH blok arsip,
  // dan tidak boleh berada di dalam catch — kalau tidak, pemindaian tetap mati.
  const iPapan = kode.indexOf('evidence_${attemptId}.jpg');
  const iUpdate = kode.indexOf('await PaymentVerificationModel.update(attemptId', iPapan);
  assert.ok(iUpdate > iPapan, 'penyimpanan keputusan harus setelah blok arsip');

  // Tidak boleh ada `throw` di dalam catch blok arsip.
  const blok = kode.slice(iPapan, iUpdate);
  assert.ok(!/catch\s*\([^)]*\)\s*\{[^}]*throw/.test(blok),
    'catch arsip tidak boleh melempar ulang — itu yang mematikan verifikasi');
});

test('jalur sukses tetap mencatat path arsip', () => {
  // Perbaikan tidak boleh menghilangkan fungsinya saat folder memang bisa ditulis.
  assert.match(kode, /evidencePrivatePath = `\/private_uploads\/\$\{frameFile\}`/,
    'path arsip tetap dicatat saat penulisan berhasil');
});

test('folder arsip disiapkan saat modul dimuat, kegagalan tidak mematikan startup', () => {
  const i = kode.indexOf('fs.mkdir(privateUploadsDir');
  assert.ok(i > 0, 'folder arsip harus disiapkan');
  const baris = kode.slice(i, i + 120);
  assert.match(baris, /catch\(/, 'mkdir harus punya catch supaya tidak mematikan startup');
});
