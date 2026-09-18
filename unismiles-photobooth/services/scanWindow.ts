/**
 * Kebijakan jendela pemindaian bukti bayar.
 *
 * Tujuan: pengunjung diberi waktu cukup untuk mengarahkan bukti bayar ke kamera
 * sambil sistem mencoba berulang kali, bukan sekali jepret lalu gagal.
 *
 * Dipisah dari komponen supaya bisa diuji tanpa browser — bagian berisiko di
 * sini adalah "kapan boleh mengirim" dan "jangan berhenti terlalu cepat".
 */

/** Total waktu pemindaian otomatis di layar pembayaran. */
export const SCAN_WINDOW_MS = 15_000;

/** Jeda antar percobaan frame. Cukup cepat agar terasa real-time. */
export const SCAN_FRAME_GAP_MS = 400;

/** Batas frame yang dikirim ke vision service, supaya unggahan tetap ringan. */
export const MAX_FRAMES_TO_SEND = 6;

/**
 * Ambang ketajaman (variance Laplacian). HANYA untuk memberi tahu pengunjung
 * apakah bukti bayarnya sudah masuk area dan terbaca jelas — bukan untuk
 * menolak. Kalibrasi: OCR masih membaca nominal pada variance ~1000 dan gagal
 * total pada ~100.
 */
export const GOOD_SHARPNESS = 300;
export const FAIR_SHARPNESS = 120;

/**
 * Jumlah frame bagus sebelum pengiriman dipercepat. Kalau bukti bayar sudah
 * terbaca jelas dua kali, tidak ada gunanya membuat pengunjung menunggu sampai
 * jendela waktu habis.
 */
export const TARGET_GOOD_FRAMES = 2;

export type FrameQuality = 'good' | 'fair' | 'poor';

export interface FrameLike {
  sharpness: number;
}

export function remainingMs(elapsedMs: number): number {
  return Math.max(0, SCAN_WINDOW_MS - elapsedMs);
}

export function isWindowOver(elapsedMs: number): boolean {
  return remainingMs(elapsedMs) <= 0;
}

/** Persentase progres jendela, 0-100 (dipakai untuk progress bar). */
export function progressPercent(elapsedMs: number): number {
  if (SCAN_WINDOW_MS <= 0) return 100;
  return Math.min(100, Math.round((elapsedMs / SCAN_WINDOW_MS) * 100));
}

/** Detik tersisa untuk ditampilkan ke pengunjung. */
export function remainingSeconds(elapsedMs: number): number {
  return Math.ceil(remainingMs(elapsedMs) / 1000);
}

export function classifyFrame(sharpness: number): FrameQuality {
  if (sharpness >= GOOD_SHARPNESS) return 'good';
  if (sharpness >= FAIR_SHARPNESS) return 'fair';
  return 'poor';
}

export function countGoodFrames(frames: FrameLike[]): number {
  return (frames || []).filter((f) => classifyFrame(f.sharpness) === 'good').length;
}

/**
 * Pesan panduan sesuai kondisi gambar saat ini.
 *
 * Pengunjung perlu tahu apakah bingkainya sudah tepat: tanpa umpan balik, satu-
 * satunya tanda yang mereka lihat adalah kegagalan di akhir.
 */
export function scanHint(quality: FrameQuality, hasAnyFrame: boolean): string {
  if (!hasAnyFrame) return 'Arahkan bukti bayar (layar sukses) ke kamera';
  switch (quality) {
    case 'good':
      return 'Bagus! Tahan sebentar, sedang membaca...';
    case 'fair':
      return 'Posisikan bukti bayar di dalam area scan';
    default:
      return 'Dekatkan layar HP ke kamera, hindari pantulan cahaya';
  }
}

/**
 * Kapan frame dikirim ke vision service.
 *
 * Dua jalan keluar, sengaja keduanya ada:
 *  - cukup frame bagus  -> kirim lebih awal (pengunjung tidak menunggu sia-sia)
 *  - jendela waktu habis -> kirim frame terbaik yang sempat terkumpul, supaya
 *    upaya pengunjung tidak dibuang hanya karena gambarnya tidak pernah "bagus".
 *
 * Tidak pernah mengirim tanpa satu pun frame: itu berarti kamera bermasalah.
 */
export function shouldSubmit(frames: FrameLike[], elapsedMs: number): boolean {
  if (!frames || frames.length === 0) return false;
  if (countGoodFrames(frames) >= TARGET_GOOD_FRAMES) return true;
  return isWindowOver(elapsedMs);
}

/**
 * Simpan hanya N frame terbaik menurut ketajaman.
 *
 * Percobaan berjalan terus-menerus selama jendela waktu, jadi tanpa pembatasan
 * ini ratusan frame akan menumpuk di memori dan ikut terunggah.
 */
export function keepBestFrames<T extends FrameLike>(frames: T[], incoming: T, max = MAX_FRAMES_TO_SEND): T[] {
  const next = [...(frames || []), incoming].sort((a, b) => b.sharpness - a.sharpness);
  return next.slice(0, max);
}

/** Frame dikirim paling tajam lebih dulu, sisanya sebagai cadangan. */
export function orderFramesForUpload<T extends FrameLike>(frames: T[]): T[] {
  return [...(frames || [])].sort((a, b) => b.sharpness - a.sharpness);
}
