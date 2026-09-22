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

// --- Saklar dari panel Admin ---

const paymentController = read(path.join(backend, 'controllers', 'paymentController.js'));

/**
 * Buang komentar sebelum memeriksa pola kode.
 *
 * Diperlukan di sini: komentar penjelas menyebut pola LAMA sebagai contoh cacat,
 * dan pemeriksaan teks biasa akan membacanya sebagai kode yang masih ada. Itu
 * membuat test gagal pada perbaikan yang benar — dan lebih buruk, membuat orang
 * menghapus penjelasannya supaya test hijau.
 */
const kodeSaja = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('Admin bisa menyalakan dan mematikan permintaan pembayaran', () => {
  // Sebelumnya kunci ini HANYA bisa diubah lewat SQL langsung, dan itu sebabnya
  // menyalakannya kembali harus lewat query manual. Sekarang panel Admin punya
  // kontaknya.
  assert.match(paymentController, /payment_required,/,
    'field harus dibaca dari request');
  assert.match(paymentController, /paymentData\.payment_required = payment_required;/,
    'nilainya harus benar-benar disimpan ke payment_data');
});

test('field yang tidak dikirim TIDAK mengubah pembayaran', () => {
  // Inilah yang paling mudah salah: kalau ditulis tanpa memeriksa, setiap
  // penyimpanan form — termasuk dari klien lama yang belum punya saklar ini —
  // akan mematikan pembayaran tanpa ada yang memintanya.
  assert.match(paymentController, /typeof payment_required === 'boolean'/,
    'hanya boolean yang boleh mengubah; nilai hilang berarti tidak diubah');
  // Dan bukan `!!payment_required`, yang akan mengubah nilai hilang jadi false.
  assert.ok(!/paymentData\.payment_required = !!payment_required/.test(paymentController),
    'tidak boleh memakai konversi yang membuat nilai hilang jadi false');
});

test('nilai yang bukan boolean ditolak, bukan dikonversi', () => {
  // "false" (string) dan 0 tidak boleh menyalakan atau mematikan apa pun.
  // Menolak dengan pesan jelas lebih baik daripada diam-diam menafsirkan.
  assert.match(paymentController, /payment_required harus true atau false/,
    'nilai aneh harus ditolak dengan pesan yang bisa dimengerti');
});

test('saklar ini berbeda dari verification_mode: disabled', () => {
  // verification_mode mematikan PEMERIKSAAN bukti bayar; alurnya tetap meminta
  // bayar. Saklar ini mematikan PERMINTAANNYA. Dua hal berbeda, dan
  // menggabungkannya akan membuat "disabled" ikut menggratiskan cetak.
  assert.match(paymentController, /paymentData\.verification_mode = verification_mode/,
    'verification_mode tetap disimpan terpisah');
  assert.ok(!/payment_required\s*=\s*verification_mode/.test(paymentController),
    'saklar tidak boleh diturunkan dari verification_mode');
});

// --- Sisi Admin ---

const settings = read(path.join(repo, 'unismiles-admin', 'src', 'pages', 'Settings.tsx'));

test('panel Admin memuat nilai yang tersimpan, bukan menebak', () => {
  assert.match(settings, /setPaymentRequired\(paymentData\.payment_required !== false\)/,
    'hanya false yang mematikan; nilai hilang berarti meminta bayar');
});

test('panel Admin mengirim nilainya saat disimpan', () => {
  assert.match(settings, /payment_required: paymentRequired/,
    'saklar harus ikut terkirim, kalau tidak Admin hanya terlihat berubah');
});

test('saklar ada di tab Settings bagian payment', () => {
  assert.match(settings, /id="toggle-payment-required"/,
    'kontrolnya harus punya id stabil untuk diuji');
  assert.match(settings, /id="payment-required-state"/,
    'harus ada keterangan keadaan yang terlihat');
  assert.match(settings, /Payment Required/, 'harus ada label yang jelas');
});

test('bawaan di panel Admin adalah meminta bayar', () => {
  assert.match(settings, /useState\(true\);[^\n]*\n?[\s\S]{0,200}paymentRequired|const \[paymentRequired, setPaymentRequired\] = useState\(true\)/,
    'bawaan harus true supaya pemasukan tidak mati tanpa diminta');
});

// --- Dua penulis ke satu kolom JSON tidak boleh saling menimpa ---

test('unggah gambar QRIS tidak menghapus pengaturan lain', () => {
  // INI AKAR MASALAHNYA: sebelum ini, unggah gambar menulis
  // JSON.stringify({ qris_image_url }) — mengganti SELURUH payment_data.
  // Jadi mematikan pembayaran dari Admin lalu mengganti gambar QRIS akan
  // menghapus saklarnya, dan kiosk kembali meminta bayar. Gejalanya persis
  // seperti laporan "sudah disable tapi masih ada proses payment".
  const kode = kodeSaja(paymentController);
  assert.ok(!/JSON\.stringify\(\{ qris_image_url: fileUrl \}\)/.test(kode),
    'tidak boleh menulis objek baru yang hanya berisi gambar QRIS');
  // Spasi di dalam objek dibiarkan longgar; yang penting penggabungannya ada.
  assert.match(kode, /\{[^}]*\.\.\.paymentData[^}]*qris_image_url: fileUrl[^}]*\}/,
    'unggahan harus MENGGABUNG dengan pengaturan yang sudah ada');
});

test('kedua penulis payment_data menggabung, bukan menimpa', () => {
  // Ada dua jalur yang menulis kolom yang sama: update profil dan unggah
  // gambar. Keduanya harus membaca dulu, baru menggabung — kalau salah satu
  // menimpa, pengaturan pengguna hilang tanpa pesan apa pun.
  const kode = kodeSaja(paymentController);
  const jumlahBaca = (kode.match(/findDefaultForKiosk/g) || []).length;
  assert.ok(jumlahBaca >= 2,
    'kedua penulis harus membaca yang ada dulu (ditemukan ' + jumlahBaca + ')');
  const jumlahGabung = (kode.match(/\.\.\.paymentData/g) || []).length;
  assert.ok(jumlahGabung >= 1, 'harus ada penggabungan eksplisit');
});
