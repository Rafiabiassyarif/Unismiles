/**
 * Ukuran kertas cetak untuk Kiosk Agent — CERMIN dari unismiles-backend/utils/paperSizes.js.
 *
 * Kenapa dicerminkan, bukan diimpor langsung: agent berjalan di komputer kiosk
 * yang terpisah dari server, jadi tidak bisa require berkas backend. Karena itu
 * daftarnya ditulis di sini — tetapi HANYA di satu tempat per sisi (sebelumnya
 * blok yang sama disalin dua kali di berkas ini, dan itu penyebab ukuran kertas
 * bisa berbeda antara penerimaan job dan penerapan konfigurasi).
 *
 * Kalau daftar di backend berubah, ubah juga di sini. Test membandingkan kedua
 * daftar supaya ketidaksamaan tertangkap.
 */

/**
 * Batas fisik printer label termal (NIIMBOT B1 Pro).
 *
 * maxPrintWidthMm (48,77 mm) = lebar kepala cetak; gambar dikunci ke angka ini.
 * maxPaperWidthMm (60 mm) = lebar KERTAS yang masih wajar. Kertas boleh lebih
 * lebar dari kepala cetak — label 54 mm memang begitu, 5,25 mm kanannya tidak
 * tercetak. Jangan samakan kedua angka ini.
 */
const THERMAL_LIMITS = {
  maxPaperWidthMm: 60,
  maxPrintWidthMm: 48.77,
  minHeightMm: 8,
  maxHeightMm: 350,
  dpi: 300,
};

const PHOTO_PRESETS = [
  'Instax Mini (54 × 86 mm)',
  'Polaroid 6 × 9 cm (2R)',
  '2 Strip 5 × 15 cm',
  '3 Strip 5 × 15 cm',
  '4 Strip 5 × 15 cm',
  '2×2 Grid 10 × 10 cm',
  '2×3 Grid 10 × 15 cm',
];

const THERMAL_PRESETS = [
  'Termal 40 × 60 mm (2 foto)',
  'Termal 40 × 90 mm (3 foto)',
  'Termal 40 × 120 mm (4 foto)',
  'Termal 48 × 150 mm (strip panjang)',
  'Termal 30 × 40 mm (label kecil)',
];

/** Nilai ringkas (huruf kapital) yang diterima dari backend lama. */
const LEGACY_VALUES = [
  '2R', '3R', '4R', 'STRIP', '6R',
  'POLAROID', 'STRIP 2', 'STRIP 3', 'STRIP 4',
  'GRID', 'GRID 2X2', 'GRID 2X3', 'GRID 3X3',
];

const PAPER_SIZES = [...PHOTO_PRESETS, ...THERMAL_PRESETS];

/** Pola ukuran kustom: "CUSTOM 48X150 MM". */
const CUSTOM_PATTERN = /^CUSTOM\s+(\d{1,3})\s*[X×]\s*(\d{1,3})\s*MM$/i;

function parseCustomSize(value) {
  const match = String(value || '').trim().match(CUSTOM_PATTERN);
  if (!match) return null;
  const widthMm = Number(match[1]);
  const heightMm = Number(match[2]);
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) return null;
  return { widthMm, heightMm };
}

/** Validasi ukuran kustom terhadap batas printer termal. */
function validateCustomSize(value, limits = THERMAL_LIMITS) {
  const parsed = parseCustomSize(value);
  if (!parsed) {
    return { ok: false, message: 'Ukuran kustom harus berformat "CUSTOM <lebar>X<tinggi> MM".' };
  }
  const { widthMm, heightMm } = parsed;
  // Lebar kertas boleh melebihi kepala cetak; bagian berlebih tidak tercetak.
  if (widthMm > limits.maxPaperWidthMm) {
    return { ok: false, message: `Lebar ${widthMm} mm melebihi lebar kertas maksimum (${limits.maxPaperWidthMm} mm).` };
  }
  if (heightMm < limits.minHeightMm || heightMm > limits.maxHeightMm) {
    return { ok: false, message: `Tinggi ${heightMm} mm di luar rentang ${limits.minHeightMm}-${limits.maxHeightMm} mm.` };
  }
  return { ok: true };
}

/**
 * Apakah ukuran kertas ini didukung agent.
 * Menerima: preset foto, preset termal, nilai ringkas lama, dan ukuran kustom.
 */
function isSupportedPaperSize(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (PAPER_SIZES.includes(text)) return true;
  if (LEGACY_VALUES.includes(text.toUpperCase())) return true;
  return validateCustomSize(text).ok;
}

/** Ukuran ini keluarga termal? (preset termal atau kustom) */
function isThermalSize(value) {
  const text = String(value || '').trim();
  return THERMAL_PRESETS.includes(text) || Boolean(parseCustomSize(text));
}

module.exports = {
  THERMAL_LIMITS,
  PHOTO_PRESETS,
  THERMAL_PRESETS,
  LEGACY_VALUES,
  PAPER_SIZES,
  parseCustomSize,
  validateCustomSize,
  isSupportedPaperSize,
  isThermalSize,
};
