const assert = require('node:assert');
const { test } = require('node:test');
const { decideVerification, statusKind } = require('../utils/paymentDecision');

/**
 * Data nyata dari produksi, sesi B4AADDB6 (tagihan Rp 5.087):
 *
 *   attempt #7 dan #8:
 *     extracted_amount 5087  == expected 5087   <- OCR BACA PERSIS BENAR
 *     ocr_confidence   0.9
 *     reason_codes     [IMAGE_BLURRY, PAYMENT_NOT_SUCCESS,
 *                       MERCHANT_MISMATCH, LOW_CONFIDENCE]
 *     decision         needs_retry
 *
 * Artinya nominal sudah benar tetapi tetap ditolak karena pemeriksaan pendukung.
 * Nominal kiosk unik per transaksi, jadi nominal yang cocok persis sudah cukup.
 */
const REAL_ATTEMPT_7 = {
  expectedAmount: 5087,
  extractedAmount: 5087,
  extractedStatus: 'pending',   // kata "berhasil" tidak terbaca kamera
  qualityScore: 0.2,            // gambar dinilai kurang tajam
  screenType: 'receipt_detail',
  strictMatch: true,
  duplicateReference: false,
  merchantMatches: false,       // nama merchant tidak terbaca
};

test('nominal cocok persis = verified walau gambar dinilai buram', () => {
  const r = decideVerification(REAL_ATTEMPT_7);
  assert.strictEqual(r.decision, 'verified', `dapat ${r.decision} ${JSON.stringify(r.reasonCodes)}`);
  assert.deepStrictEqual(r.reasonCodes, [], 'tidak boleh ada alasan penolakan tersisa');
});

test('nominal cocok persis = verified walau kata "berhasil" tidak terbaca', () => {
  const r = decideVerification({ ...REAL_ATTEMPT_7, extractedStatus: null });
  assert.strictEqual(r.decision, 'verified');
});

test('nominal cocok persis = verified walau jenis layar tidak dikenali', () => {
  const r = decideVerification({ ...REAL_ATTEMPT_7, screenType: 'unknown' });
  assert.strictEqual(r.decision, 'verified');
});

test('nominal cocok persis = verified walau merchant tidak cocok', () => {
  const r = decideVerification({ ...REAL_ATTEMPT_7, merchantMatches: false });
  assert.strictEqual(r.decision, 'verified');
});

// ---------------------------------------------------------------------------
// Penyeimbang: uang nyata tetap harus dilindungi.
// ---------------------------------------------------------------------------

test('struk yang JELAS menyatakan gagal tetap ditolak', () => {
  const r = decideVerification({ ...REAL_ATTEMPT_7, extractedStatus: 'failed' });
  assert.notStrictEqual(r.decision, 'verified', 'struk gagal tidak boleh lolos');
  assert.ok(r.reasonCodes.includes('PAYMENT_NOT_SUCCESS'));
});

test('nominal berbeda tetap ditolak walau status sukses', () => {
  const r = decideVerification({
    ...REAL_ATTEMPT_7,
    extractedAmount: 5000,
    extractedStatus: 'success',
  });
  assert.strictEqual(r.decision, 'needs_retry');
  assert.ok(r.reasonCodes.includes('AMOUNT_MISMATCH'));
});

test('nominal tidak terbaca sama sekali tidak bisa verified', () => {
  const r = decideVerification({ ...REAL_ATTEMPT_7, extractedAmount: null });
  assert.notStrictEqual(r.decision, 'verified');
  assert.ok(r.reasonCodes.includes('LOW_CONFIDENCE'));
});

test('bukti yang sudah pernah dipakai selalu ditolak (anti-replay)', () => {
  const r = decideVerification({ ...REAL_ATTEMPT_7, duplicateReference: true });
  assert.strictEqual(r.decision, 'rejected');
  assert.ok(r.reasonCodes.includes('DUPLICATE_REFERENCE'),
    'anti-replay harus menang atas nominal yang cocok');
});

// ---------------------------------------------------------------------------
// Skenario berkas nyata lainnya
// ---------------------------------------------------------------------------

test('nominal tertukar satu digit tetap ditolak', () => {
  // Kejadian nyata: tagihan 5059 terbaca 5050.
  const r = decideVerification({
    expectedAmount: 5059,
    extractedAmount: 5050,
    extractedStatus: 'success',
    qualityScore: 0.5,
    screenType: 'receipt_detail',
    strictMatch: true,
  });
  assert.notStrictEqual(r.decision, 'verified');
  assert.ok(r.reasonCodes.includes('AMOUNT_MISMATCH'));
});

test('gambar buram tanpa nominal memunculkan alasan yang berguna bagi pengunjung', () => {
  const r = decideVerification({
    expectedAmount: 5087,
    extractedAmount: null,
    extractedStatus: null,
    qualityScore: 0.1,
    screenType: 'unknown',
    strictMatch: true,
  });
  assert.strictEqual(r.decision, 'needs_retry');
  for (const code of ['IMAGE_BLURRY', 'DETAIL_SCREEN_REQUIRED', 'PAYMENT_NOT_SUCCESS', 'LOW_CONFIDENCE']) {
    assert.ok(r.reasonCodes.includes(code), `harus menyertakan ${code}`);
  }
});

test('statusKind membaca status struk dengan benar', () => {
  assert.strictEqual(statusKind('Berhasil'), 'success');
  assert.strictEqual(statusKind('SUCCESS'), 'success');
  assert.strictEqual(statusKind('gagal'), 'failed');
  assert.strictEqual(statusKind('failed'), 'failed');
  assert.strictEqual(statusKind('pending'), 'unknown');
  assert.strictEqual(statusKind(null), 'unknown');
});

test('nominal sebagai string tetap dibandingkan dengan benar', () => {
  const r = decideVerification({
    expectedAmount: '5087.00',
    extractedAmount: '5087',
    extractedStatus: 'success',
    qualityScore: 0.9,
    screenType: 'receipt_detail',
    strictMatch: true,
  });
  assert.strictEqual(r.decision, 'verified');
});
