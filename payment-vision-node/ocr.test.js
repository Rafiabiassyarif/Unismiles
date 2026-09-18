const assert = require('node:assert');
const { test } = require('node:test');
const { normalizeAmount, collectAmounts, extract, scoreFrame, pickBestFrame } = require('./ocr');

test('normalisasi nominal: terima rupiah wajar, tolak di luar rentang', () => {
  assert.strictEqual(normalizeAmount('5.068'), 5068);
  assert.strictEqual(normalizeAmount('Rp 10.049'), 10049);
  assert.strictEqual(normalizeAmount('999'), null);
  assert.strictEqual(normalizeAmount('99999999999'), null);
  assert.strictEqual(normalizeAmount(''), null);
  assert.strictEqual(normalizeAmount(undefined), null);
});

// Nomor transaksi 19 digit pernah terbaca OCR sebagai potongan 7 digit
// ("2026091") lalu dianggap nominal, sehingga pembayaran ditolak.
test('angka gundul tidak pernah jadi nominal utama', () => {
  const { strong, all } = collectAmounts('No. Transaksi 20260918435090531176054');
  assert.deepStrictEqual(strong, []);
  assert.ok(!all.includes(2026091), 'potongan nomor transaksi tidak boleh jadi kandidat');
});

test('angka berpemisah ribuan tetap jadi kandidat kuat', () => {
  const { strong } = collectAmounts('nominal Transaksi Rp 5.068 biaya GRATIS');
  assert.deepStrictEqual(strong, [5068]);
});

test('nominal tagihan menang walau ada angka lain di layar', () => {
  const text = 'Pembayaran Diterima Rp 5.068 No. Transaksi 20260918435090531176054';
  const r = extract(text, 5068);
  assert.strictEqual(r.amount, 5068);
  assert.strictEqual(r.status, 'success');
});

test('nominal tagihan yang tidak terbaca tidak diganti angka sampah', () => {
  const text = 'Pembayaran Diterima No. Transaksi 20260918435090531176054';
  const r = extract(text, 5068);
  assert.notStrictEqual(r.amount, 2026091);
  assert.strictEqual(r.amount, null);
});

test('frame blur (tanpa angka) dapat skor rendah', () => {
  const r = scoreFrame('   \n \n ', 5068);
  assert.ok(r.frame_score < 0.2, `skor harus rendah, dapat ${r.frame_score}`);
  assert.strictEqual(r.amount, null);
});

test('frame tajam dapat skor tinggi', () => {
  const r = scoreFrame('Pembayaran Diterima Rp 5.068 Ke Uni Inside No. Transaksi 20260918435090531176054', 5068);
  assert.ok(r.frame_score >= 0.8, `skor harus tinggi, dapat ${r.frame_score}`);
});

test('frame terbaik dipilih dari campuran blur dan tajam', () => {
  const texts = [
    '   |  \n  ~ ',
    'Pembayaran Diterima Rp 5.068 Ke Uni Inside No. Transaksi 20260918435090531176054',
    '5.06¢'
  ];
  const best = pickBestFrame(texts, 5068);
  assert.strictEqual(best.amount, 5068);
  assert.ok(best.frame_score >= 0.8);
});

test('nominal dipinjam dari frame lain bila frame terbaik tidak membacanya', () => {
  const texts = [
    'Pembayaran Diterima Ke Uni Inside Nama Acquirer GoPay',
    'Pembayaran Diterima Rp 5.068 No. Transaksi 20260918435090531176054'
  ];
  const best = pickBestFrame(texts, 5068);
  assert.strictEqual(best.amount, 5068);
});

test('semua frame blur tetap tidak menghasilkan nominal palsu', () => {
  const best = pickBestFrame(['  ', '~  ', ''], 5068);
  assert.strictEqual(best.amount, null);
  assert.ok(best.frame_score < 0.2);
});

test('tanpa frame sama sekali tidak melempar error', () => {
  assert.strictEqual(pickBestFrame([], 5068), null);
  assert.strictEqual(pickBestFrame(null, 5068), null);
});
