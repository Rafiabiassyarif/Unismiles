/**
 * ocr.js — pembacaan bukti bayar.
 *
 * Prinsip: NOMINAL adalah bukti utama. Nominal kiosk sudah unik per transaksi
 * (harga Admin + kode unik Rp1-Rp99), jadi nominal + status sukses sudah cukup
 * untuk mencocokkan satu bukti bayar ke satu sesi.
 *
 * Karena itu angka ambigu di layar struk (nomor transaksi, nomor referensi,
 * tanggal) TIDAK boleh dipakai sebagai nominal. Hanya angka yang ditulis dengan
 * pemisah ribuan (5.068) atau berawalan Rp yang dianggap kandidat kuat.
 */

const AMOUNT_STRONG = /(?:rp\.?\s*)?([0-9]{1,3}(?:\.[0-9]{3})+)(?:,[0-9]{2})?/gi;
const AMOUNT_RP = /rp\.?\s*([0-9]{4,9})(?:,[0-9]{2})?/gi;
const AMOUNT_BARE = /([0-9]{4,7})/g;

const MIN_AMOUNT = 1000;
const MAX_AMOUNT = 10000000;

function normalizeAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const digits = String(value).replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n >= MIN_AMOUNT && n <= MAX_AMOUNT ? n : null;
}

/**
 * Kumpulkan kandidat angka.
 * strong = ada pemisah ribuan atau awalan Rp (mis. "5.068", "Rp 5.068")
 * weak   = angka gundul 4-7 digit (mis. "2026091" dari nomor transaksi)
 */
function collectAmounts(text) {
  const strong = [];
  const weak = [];
  const push = (list, value) => {
    const n = normalizeAmount(value);
    if (n && !list.includes(n)) list.push(n);
  };

  let m;
  AMOUNT_STRONG.lastIndex = 0;
  while ((m = AMOUNT_STRONG.exec(text))) push(strong, m[1]);

  AMOUNT_RP.lastIndex = 0;
  while ((m = AMOUNT_RP.exec(text))) push(strong, m[1]);

  AMOUNT_BARE.lastIndex = 0;
  while ((m = AMOUNT_BARE.exec(text))) {
    const before = text[m.index - 1];
    const after = text[m.index + m[0].length];
    // Potongan dari angka yang lebih panjang (mis. bagian "2026091" dari
    // nomor transaksi 20260918435090531176054) bukan nominal.
    if (before === '.' || before === ',' || after === '.' || after === ',') continue;
    if (after === undefined || /[0-9]/.test(after)) continue;
    push(weak, m[1]);
  }

  const all = strong.concat(weak.filter(v => !strong.includes(v)));
  return { strong, weak, all };
}

function extract(text, expected) {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const { strong, all } = collectAmounts(source);

  const expectedAmount = normalizeAmount(expected);
  // Nominal tagihan menang kalau benar-benar terbaca; kalau tidak, pakai
  // kandidat kuat pertama. Angka gundul tidak dipakai (terlalu ambigu).
  const amount = expectedAmount && all.includes(expectedAmount)
    ? expectedAmount
    : (strong[0] || null);

  const failed = /(gagal|failed|dibatalkan|expired|kadaluarsa|ditolak)/i.test(lower);
  const success = /(berhasil|sukses|success|successful|lunas|diterima|transfer|pembayaran|transaksi|bukti|qris)/i.test(lower);
  const provider = /dana/i.test(lower) ? 'DANA'
    : /gopay|go-pay|gojek/i.test(lower) ? 'GOPAY'
    : /ovo/i.test(lower) ? 'OVO'
    : /shopee|seabank/i.test(lower) ? 'SHOPEEPAY_SEABANK'
    : /qris|bank/i.test(lower) ? 'QRIS_BANK'
    : 'UNKNOWN';
  const ref = (lower.match(/(?:ref(?:erence)?|transaksi|trx|order)[^a-z0-9]*([a-z0-9-]{8,35})/i) || [])[1] || null;

  return {
    provider,
    provider_confidence: provider === 'UNKNOWN' ? 0.5 : 0.9,
    screen_type: amount ? 'receipt_detail' : 'unknown',
    status: failed ? 'failed' : (success ? 'success' : 'pending'),
    amount,
    merchant: /uni|smile|unismiles/i.test(lower) ? 'UNI SMILE' : 'UNKNOWN',
    reference_id: ref,
    ocr_text: source.slice(0, 4000),
    amount_candidates: all
  };
}

/**
 * Nilai kualitas satu frame dari apa yang benar-benar terbaca, bukan angka
 * tetap. Frame paling tajam = frame yang nominalnya terbaca persis.
 */
function scoreFrame(text, expected) {
  const parsed = extract(text, expected);
  const expectedAmount = normalizeAmount(expected);
  let score = 0;

  if (expectedAmount && parsed.amount === expectedAmount) score += 0.55;
  else if (parsed.amount) score += 0.2;
  if (parsed.status === 'success') score += 0.2;
  if (parsed.reference_id) score += 0.15;
  if (parsed.merchant !== 'UNKNOWN') score += 0.1;

  return { ...parsed, frame_score: Math.min(1, Number(score.toFixed(3))) };
}

/**
 * Pilih frame terbaik dari beberapa jepretan. Frame blur menghasilkan OCR
 * kosong sehingga skornya rendah dan otomatis kalah.
 */
function pickBestFrame(texts, expected) {
  const scored = (texts || []).map(text => scoreFrame(text, expected));
  if (!scored.length) return null;

  let best = scored[0];
  for (const candidate of scored.slice(1)) {
    const better = candidate.frame_score > best.frame_score
      || (candidate.frame_score === best.frame_score
          && (candidate.ocr_text || '').length > (best.ocr_text || '').length);
    if (better) best = candidate;
  }

  const expectedAmount = normalizeAmount(expected);
  return {
    ...best,
    // Kalau frame terbaik belum menemukan nominal tagihan, coba pinjam dari
    // frame lain: satu frame bisa membaca nominal, frame lain membaca status.
    ...(expectedAmount && best.amount !== expectedAmount
        ? (() => {
            const donor = scored.find(s => s.amount === expectedAmount);
            return donor ? { amount: donor.amount, amount_frame_index: donor.frame_index } : {};
          })()
        : {}),
    frame_scores: scored.map(s => s.frame_score)
  };
}

/**
 * Gabungkan kandidat nominal dari beberapa frame.
 *
 * Satu frame bisa salah baca satu digit (log produksi: 5.073 terbaca 9.073).
 * Karena tiap jepretan punya noise berbeda, frame lain biasanya membaca angka
 * yang benar. Kandidat hanya diterima kalau PERSIS sama dengan nominal tagihan,
 * jadi ini tidak melonggarkan validasi — hanya menambah kesempatan menemukan
 * nominal yang sudah benar.
 */
function voteAmounts(texts, expected) {
  const votes = new Map();
  const perFrame = [];
  for (const text of (texts || [])) {
    const { strong } = collectAmounts(String(text || ''));
    perFrame.push(strong);
    for (const value of strong) votes.set(value, (votes.get(value) || 0) + 1);
  }

  const expectedAmount = normalizeAmount(expected);
  if (expectedAmount && votes.has(expectedAmount)) {
    return { amount: expectedAmount, matched: true, perFrame, votes: Object.fromEntries(votes) };
  }
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  return { amount: top ? top[0] : null, matched: false, perFrame, votes: Object.fromEntries(votes) };
}

module.exports = { normalizeAmount, collectAmounts, extract, scoreFrame, pickBestFrame, voteAmounts };
