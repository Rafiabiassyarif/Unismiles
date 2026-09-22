const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Migrasi kalibrasi cetak.
 *
 * Diuji karena migrasi yang gagal setengah jalan akan membuat backend menulis
 * ke kolom yang tidak ada — dan itu terjadi saat deploy, bukan saat duduk di
 * laptop. Yang paling penting di sini: klaim IDEMPOTEN harus benar. MySQL 8.x
 * tidak punya `ADD COLUMN IF NOT EXISTS` (itu fitur MariaDB), jadi kalau orang
 * menulisnya, migrasi kedua akan gagal.
 */

const sql = fs.readFileSync(path.join(__dirname, '..', 'migrate_print_calibration.sql'), 'utf8');

/**
 * SQL tanpa komentar.
 *
 * Wajib: berkas migrasi ini MENJELASKAN kenapa `ADD COLUMN IF NOT EXISTS` tidak
 * dipakai, jadi kata-kata itu ada di dalam komentar. Memeriksa berkas mentah
 * akan menandai penjelasannya sendiri sebagai pelanggaran.
 */
const sqlCode = sql
  .replace(/--[^\n]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const FIELDS = ['thermal_density', 'thermal_offset_y_px', 'photo_fit_mode', 'photo_brightness', 'photo_contrast', 'photo_saturation'];

test('semua kolom yang dipakai backend ada di migrasi', () => {
  for (const field of FIELDS) {
    assert.ok(sql.includes(`'${field}'`), `migrasi harus menambah kolom ${field}`);
  }
});

test('idempoten tanpa ADD COLUMN IF NOT EXISTS (tidak didukung MySQL 8)', () => {
  // Pola ini akan GAGAL di MySQL 8 dan menghentikan deploy sebelum sempat
  // me-restart backend. Perhatikan: berkas ini juga MENJELASKAN hal itu di
  // komentar, jadi pemeriksaan memakai sqlCode (komentar dibuang) — kalau tidak,
  // penjelasannya sendiri dianggap pelanggaran.
  assert.ok(!/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i.test(sqlCode),
    'jangan pakai ADD COLUMN IF NOT EXISTS — itu MariaDB, bukan MySQL 8');

  // Sebagai gantinya: cek INFORMATION_SCHEMA, lalu ALTER lewat prepared statement.
  assert.match(sqlCode, /INFORMATION_SCHEMA\.COLUMNS/, 'harus mengecek keberadaan kolom dulu');
  assert.match(sqlCode, /PREPARE\s+stmt\s+FROM\s+@ddl/, 'ALTER harus lewat prepared statement');
  assert.match(sqlCode, /CONCAT\('ALTER TABLE/, 'ALTER dibangun saat runtime, hanya bila perlu');

  // Setiap ALTER TABLE yang benar-benar dieksekusi harus berada di dalam jalur
  // "hanya kalau belum ada" — bukan ALTER langsung di level atas.
  const directAlters = sqlCode
    .split('\n')
    .filter(line => /^\s*ALTER\s+TABLE/i.test(line));
  assert.deepStrictEqual(directAlters, [],
    'tidak boleh ada ALTER TABLE langsung; semua lewat prosedur pengecekan');
});

test('nilai bawaan netral: tidak mengubah hasil cetak yang sudah ada', () => {
  // Baris lama mendapat nilai ini saat migrasi. Kalau tidak netral, semua kiosk
  // yang sudah jalan akan tiba-tiba mencetak dengan tampilan berbeda.
  assert.match(sql, /'thermal_density'[\s\S]{0,200}DEFAULT 3/, 'kepekatan netral = 3');
  assert.match(sql, /'thermal_offset_y_px'[\s\S]{0,200}DEFAULT 0/, 'geser netral = 0');
  assert.match(sql, /'photo_fit_mode'[\s\S]{0,200}DEFAULT 'fit'/, 'mode aman = fit (tidak gepeng)');
  assert.match(sql, /'photo_brightness'[\s\S]{0,200}DEFAULT 100/, 'brightness netral = 100%');
  assert.match(sql, /'photo_contrast'[\s\S]{0,200}DEFAULT 100/, 'contrast netral = 100%');
  assert.match(sql, /'photo_saturation'[\s\S]{0,200}DEFAULT 100/, 'saturasi netral = 100%');
});

test('batas nilai di komentar cocok dengan yang divalidasi backend', () => {
  const { PHOTO_ADJUST_LIMITS } = require('../utils/printingConfigValidation');
  // Komentar yang salah menyesatkan operator yang menyetel manual lewat SQL.
  assert.ok(sql.includes(`50-150`) && PHOTO_ADJUST_LIMITS.photo_brightness.min === 50,
    'rentang brightness di komentar = rentang validasi');
  assert.ok(sql.includes(`0-150`) && PHOTO_ADJUST_LIMITS.photo_saturation.min === 0,
    'rentang saturasi di komentar = rentang validasi (0 = hitam putih)');
  assert.ok(sql.includes('1-5') && PHOTO_ADJUST_LIMITS.thermal_density.min === 1,
    'rentang kepekatan di komentar = rentang validasi');
});

test('migrasi TIDAK menyentuh jalur OCR verifikasi pembayaran', () => {
  // Foto hasil (kalibrasi ini) dan frame OCR adalah dua hal berbeda. Mencampur
  // keduanya lewat pengaturan yang sama akan merusak verifikasi pembayaran.
  assert.ok(!/ocr|struk|receipt/i.test(sql) || /tidak berlaku untuk frame yang dikirim ke OCR/i.test(sql),
    'migrasi harus jelas menyatakan tidak menyentuh jalur OCR');
});

test('tidak ada DROP/TRUNCATE yang bisa menghapus data', () => {
  assert.ok(!/DROP\s+TABLE/i.test(sql), 'migrasi tidak boleh menghapus tabel');
  assert.ok(!/TRUNCATE/i.test(sql), 'migrasi tidak boleh mengosongkan tabel');
  assert.ok(!/DROP\s+COLUMN/i.test(sql), 'migrasi tidak boleh menghapus kolom');
});
