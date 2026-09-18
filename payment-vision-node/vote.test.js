const assert = require('node:assert');
const { test } = require('node:test');
const { voteAmounts, collectAmounts, extract } = require('./ocr');

const EXPECTED = 5068;

// Kasus nyata dari log produksi: satu frame salah baca 1 digit (5.073 -> 9.073),
// frame lain membaca benar. Tanpa penggabungan, seluruh pembayaran gagal walau
// uangnya sudah masuk.
test('pulihkan nominal dari frame lain saat satu frame salah baca digit', () => {
  const texts = [
    'Pembayaran Berhasil Nominal Rp 9.073 Ke UNI SMILE',
    'Pembayaran Berhasil Nominal Rp 5.073 Ke UNI SMILE',
  ];
  const r = voteAmounts(texts, EXPECTED);
  // Tidak ada frame yang membaca 5.068, jadi tidak boleh dipaksa cocok.
  assert.strictEqual(r.matched, false);
  assert.ok(r.amount === 5073 || r.amount === 9073);
});

test('satu frame membaca tagihan persis: diterima walau frame lain salah', () => {
  const texts = [
    'Pembayaran Berhasil Nominal Rp 9.073',
    'Pembayaran Berhasil Nominal Rp 5.068 Ke UNI SMILE',
    '   ',
  ];
  const r = voteAmounts(texts, EXPECTED);
  assert.strictEqual(r.matched, true);
  assert.strictEqual(r.amount, EXPECTED);
});

// Pengaman utama: penggabungan TIDAK BOLEH menerima nominal yang bukan tagihan.
test('nominal beda tidak pernah dianggap cocok', () => {
  const texts = [
    'Pembayaran Berhasil Rp 10.000',
    'Pembayaran Berhasil Rp 20.000',
    'Pembayaran Berhasil Rp 9.073',
  ];
  const r = voteAmounts(texts, EXPECTED);
  assert.strictEqual(r.matched, false);
  assert.notStrictEqual(r.amount, EXPECTED);
});

test('semua frame tanpa angka tidak menghasilkan nominal', () => {
  const r = voteAmounts(['   ', '~ ~', ''], EXPECTED);
  assert.strictEqual(r.amount, null);
  assert.strictEqual(r.matched, false);
});

test('tanpa frame tidak melempar error', () => {
  assert.strictEqual(voteAmounts([], EXPECTED).matched, false);
  assert.strictEqual(voteAmounts(null, EXPECTED).amount, null);
  assert.strictEqual(voteAmounts(['Rp 5.068'], null).matched, false);
});

test('angka gundul dari nomor transaksi tidak ikut dipilih', () => {
  const texts = ['No. Transaksi 20260918435090531176054 Pembayaran Berhasil'];
  const r = voteAmounts(texts, EXPECTED);
  assert.strictEqual(r.amount, null, 'potongan nomor transaksi tidak boleh jadi nominal');
});

// Keseluruhan alur visi: nominal hanya boleh dianggap sah kalau PERSIS tagihan.
test('keputusan akhir tetap butuh kecocokan persis', () => {
  const texts = ['Pembayaran Berhasil Nominal Rp 5.068 Ke UNI SMILE'];
  const single = extract(texts[0], EXPECTED);
  assert.strictEqual(single.amount, EXPECTED);
  assert.strictEqual(voteAmounts(texts, EXPECTED).matched, true);

  const wrong = collectAmounts('Nominal Rp 5.168');
  assert.ok(!wrong.strong.includes(EXPECTED), 'nominal mendekati tidak boleh dianggap cocok');
});
