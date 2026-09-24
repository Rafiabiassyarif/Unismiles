const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePrintingConfig, toSocketPrintingConfig, TOMBOL_FIELDS, bacaBoolean } = require('../utils/printingConfigValidation');

/**
 * Tombol layar akhir: dikendalikan Admin, kodenya tidak dihapus.
 *
 * Yang diuji di sini adalah sisi SERVER-nya: nilainya harus bertahan sebagai
 * boolean, bawaannya aktif, dan bentuk apa pun yang datang (0/1 dari DB,
 * true/false dari JSON, string dari form) ditafsirkan dengan aturan yang sama.
 * Kalau tidak, operator mematikan tombol di Admin dan tombolnya tetap muncul.
 */

test('TOMBOL_FIELDS memuat ketiga tombol, dan itu daftar tunggalnya', () => {
  assert.deepStrictEqual(TOMBOL_FIELDS, ['show_email_button', 'show_retake_button', 'show_print_button']);
});

test('bacaBoolean: aturan yang sama untuk semua bentuk nilai', () => {
  // Mati — bentuk yang paling mudah salah (Boolean('0') = true).
  for (const mati of [0, '0', false, 'false', 'off', 'no', 'tidak', 'FALSE', ' 0 ']) {
    assert.strictEqual(bacaBoolean(mati, true), false, `${JSON.stringify(mati)} harus berarti MATI`);
  }
  for (const hidup of [1, '1', true, 'true', 'on', 'yes', 'ya']) {
    assert.strictEqual(bacaBoolean(hidup, false), true, `${JSON.stringify(hidup)} harus berarti HIDUP`);
  }
  // Belum diisi: kembali ke bawaan, bukan dianggap mati.
  for (const kosong of [undefined, null, '']) {
    assert.strictEqual(bacaBoolean(kosong, true), true);
    assert.strictEqual(bacaBoolean(kosong, false), false);
  }
  // Nilai aneh tidak mengubah apa pun.
  assert.strictEqual(bacaBoolean('mungkin', true), true);
  assert.strictEqual(bacaBoolean({}, false), false);
});

test('bawaan ketiga tombol AKTIF — kiosk yang sudah jalan tidak berubah', () => {
  const hasil = validatePrintingConfig({ adapter: 'cups' });
  for (const f of TOMBOL_FIELDS) {
    assert.strictEqual(hasil[f], true, `${f} harus bawaannya aktif`);
  }
});

test('nilai yang dikirim panel bertahan sebagai boolean sejati', () => {
  // Bentuk 0/1 (DB / form) dan true/false (JSON) harus sama hasilnya.
  const dariAngka = validatePrintingConfig({ adapter: 'cups', show_email_button: 0, show_print_button: 1 });
  assert.strictEqual(dariAngka.show_email_button, false);
  assert.strictEqual(dariAngka.show_print_button, true);
  assert.strictEqual(typeof dariAngka.show_email_button, 'boolean', 'harus boolean, bukan 0/1');

  const dariBoolean = validatePrintingConfig({ adapter: 'cups', show_email_button: false, show_print_button: true });
  assert.strictEqual(dariBoolean.show_email_button, false);
  assert.strictEqual(dariBoolean.show_print_button, true);

  const dariString = validatePrintingConfig({ adapter: 'cups', show_retake_button: '0' });
  assert.strictEqual(dariString.show_retake_button, false, "string '0' tidak boleh dianggap aktif");
});

test('field tombol diizinkan, dan tidak ada yang ditolak karena tidak dikenal', () => {
  // Kalau field-nya tidak ada di ALLOWED_FIELDS, permintaan akan ditolak dan
  // operator tidak bisa menyimpan setelannya sama sekali.
  for (const f of TOMBOL_FIELDS) {
    const hasil = validatePrintingConfig({ adapter: 'cups', [f]: false });
    assert.strictEqual(hasil[f], false, `${f} harus diterima dan tersimpan`);
  }
});

test('tombol yang dimatikan sampai ke kiosk sebagai false, bukan hilang', () => {
  // Inilah yang dibaca photobooth. Kalau field-nya hilang dari keluaran,
  // photobooth memakai bawaannya (aktif) dan tombolnya tetap muncul.
  const keluaran = toSocketPrintingConfig({
    adapter: 'cups', printing_enabled: 1,
    show_email_button: 0, show_retake_button: 0, show_print_button: 1,
  });
  assert.strictEqual(keluaran.show_email_button, false);
  assert.strictEqual(keluaran.show_retake_button, false);
  assert.strictEqual(keluaran.show_print_button, true);
  // Dan kalau baris lama tidak punya kolomnya, hasilnya tetap aktif.
  const lama = toSocketPrintingConfig({ adapter: 'cups', printing_enabled: 1 });
  for (const f of TOMBOL_FIELDS) {
    assert.strictEqual(lama[f], true, `${f} tanpa kolom di DB harus tetap aktif`);
  }
});
