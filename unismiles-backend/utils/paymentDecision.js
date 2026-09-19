/**
 * Keputusan verifikasi pembayaran, dipisah dari controller supaya bisa diuji
 * tanpa database maupun jaringan.
 *
 * Aturan intinya: NOMINAL ADALAH BUKTI UTAMA.
 * Nominal kiosk sudah unik per transaksi (harga Admin + kode unik Rp1-Rp99), jadi
 * nominal yang terbaca PERSIS sama dengan tagihan sudah membuktikan pembayaran itu
 * milik sesi tersebut.
 *
 * Kenapa aturan ini ditulis ulang: di produksi, attempt #7 dan #8 membaca
 * Rp 5.087 persis (expected 5.087, ocr_confidence 0.9, tanpa AMOUNT_MISMATCH),
 * tetapi tetap ditolak dengan IMAGE_BLURRY + PAYMENT_NOT_SUCCESS +
 * MERCHANT_MISMATCH + LOW_CONFIDENCE. Penyebabnya pemeriksaan pendukung (kualitas
 * gambar, jenis layar, kata "berhasil") dijalankan lebih dulu dan tidak pernah
 * dibatalkan, padahal angka nominalnya sudah benar.
 *
 * Pengaman yang TETAP berlaku: kalau struk jelas menyatakan gagal, bukti ditolak.
 * Jadi struk transaksi gagal tidak bisa dipakai untuk lolos.
 */

/** Ambang skor kualitas frame di bawah ini dianggap gambar kurang tajam. */
const IMAGE_BLURRY_THRESHOLD = 0.35;

/** Ambang OCR: di bawah ini pesan "kurang jelas" ditampilkan ke pengunjung. */
const LOW_CONFIDENCE_THRESHOLD = 0.35;

function normalizeAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function statusKind(extractedStatus) {
  const text = String(extractedStatus || '').trim().toLowerCase();
  if (text === 'success' || text === 'berhasil') return 'success';
  if (text === 'failed' || text === 'gagal') return 'failed';
  return 'unknown';
}

/**
 * Hitung keputusan verifikasi.
 *
 * @param {object} input
 * @param {number|string|null} input.extractedAmount nominal yang terbaca OCR
 * @param {number|string|null} input.expectedAmount  nominal tagihan sesi
 * @param {string|null} input.extractedStatus status transaksi pada struk
 * @param {number} input.qualityScore skor kualitas frame dari vision service
 * @param {string} input.screenType jenis layar yang terdeteksi
 * @param {boolean} input.strictMatch mode pencocokan ketat
 * @param {boolean} input.duplicateReference bukti ini pernah dipakai
 * @param {boolean} [input.merchantMatches] apakah nama merchant cocok dengan profil.
 *   Pemeriksaan ini PENDUKUNG: hanya dipakai kalau nominal belum cocok.
 * @returns {{decision: string, reasonCodes: string[]}}
 */
function decideVerification(input = {}) {
  const {
    extractedAmount,
    expectedAmount,
    extractedStatus,
    qualityScore = 0,
    screenType = 'unknown',
    strictMatch = false,
    duplicateReference = false,
    merchantMatches = true,
  } = input;

  const amount = normalizeAmount(extractedAmount);
  const expected = normalizeAmount(expectedAmount);
  const status = statusKind(extractedStatus);

  const amountMatches = amount !== null && expected !== null && amount === expected;

  // Bukti kuat: nominal cocok persis dan struk tidak menyatakan gagal.
  const strongProof = amountMatches && status !== 'failed';

  const reasonCodes = [];

  // Anti-replay selalu berlaku, bahkan untuk bukti kuat: bukti yang sama tidak
  // boleh dipakai dua kali.
  if (duplicateReference) {
    return { decision: 'rejected', reasonCodes: ['DUPLICATE_REFERENCE'] };
  }

  if (strongProof) {
    // Nominal adalah bukti utama; pemeriksaan pendukung tidak boleh membatalkan.
    return { decision: 'verified', reasonCodes: [] };
  }

  // ---- jalur biasa: bukti belum kuat ----
  // Kata status pada struk tidak terbaca atau tidak menyatakan berhasil.
  // Reason code yang sama dipakai untuk keduanya karena bagi pengunjung
  // tindakannya sama: pastikan layar menampilkan halaman "berhasil".
  if (status !== 'success') {
    reasonCodes.push('PAYMENT_NOT_SUCCESS');
  }

  // Kualitas gambar hanya disebut kalau nominal belum terbaca. Kalau nominalnya
  // sudah terbaca tetapi berbeda, menyebut "gambar buram" justru menyesatkan.
  if (amount === null && Number(qualityScore) < IMAGE_BLURRY_THRESHOLD) {
    reasonCodes.push('IMAGE_BLURRY');
  }

  if (screenType !== 'receipt_detail') {
    reasonCodes.push('DETAIL_SCREEN_REQUIRED');
  }

  if (amount !== null && expected !== null && !amountMatches) {
    reasonCodes.push('AMOUNT_MISMATCH');
  }

  if (strictMatch && !merchantMatches) {
    reasonCodes.push('MERCHANT_MISMATCH');
  }

  if (!amountMatches) {
    reasonCodes.push('LOW_CONFIDENCE');
  }

  return { decision: 'needs_retry', reasonCodes: [...new Set(reasonCodes)] };
}

module.exports = { decideVerification, normalizeAmount, statusKind, IMAGE_BLURRY_THRESHOLD, LOW_CONFIDENCE_THRESHOLD };
