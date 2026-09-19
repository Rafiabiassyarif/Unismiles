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

/**
 * Jeda sebelum frame pertama diambil, sejak layar pemindaian terbuka.
 *
 * Kamera butuh waktu menyesuaikan exposure, dan pengunjung butuh waktu sejenak
 * mengangkat HP ke depan lensa. Tanpa jeda ini, frame-frame pertama hampir pasti
 * kosong dan hanya membuang bagian awal jendela waktu.
 */
export const SCAN_READ_DELAY_MS = 1500;

/** Batas frame yang dikirim ke vision service, supaya unggahan tetap ringan. */
export const MAX_FRAMES_TO_SEND = 6;

/**
 * Ambang ketajaman (variance Laplacian).
 *
 * PENTING: nilai ini TIDAK dipakai untuk memutuskan kapan berhenti memindai.
 *
 * Pengukuran pada frame kamera nyata menunjukkan variance Laplacian bukan ukuran
 * "bukti bayar terlihat jelas":
 *   kamera menghadap ruangan, TANPA bukti bayar -> ketajaman 1694-1955
 *   kamera menghadap struk                      -> ketajaman 590
 * Ruangan penuh tekstur justru memberi skor LEBIH TINGGI daripada struk, sehingga
 * ambang ini pernah membuat pemindaian berhenti dalam ~1 detik tanpa ada bukti
 * bayar (keluhan: "kok cepat banget ngescan padahal tidak ada bukti bayar").
 *
 * Sekarang nilai ini hanya dipakai untuk memberi tahu pengunjung apakah gambar
 * sudah cukup tajam, dipasangkan dengan deteksi keberadaan layar.
 */
export const GOOD_SHARPNESS = 300;
export const FAIR_SHARPNESS = 120;

/**
 * Bagian piksel yang terang. Ini penanda yang benar untuk "ada layar HP di depan
 * kamera": layar HP jauh lebih terang daripada ruangan pada umumnya.
 *
 * Diukur pada frame nyata: kamera menghadap struk = 97% piksel terang; kamera
 * menghadap ruangan = 1,6%. Jaraknya lebar, jadi ambangnya tidak sensitif.
 */
export const SCREEN_BRIGHT_RATIO = 0.12;

/**
 * Jumlah frame yang sudah memenuhi syarat sebelum pengiriman dipercepat.
 * Dipakai bersama deteksi layar, bukan hanya ketajaman.
 */
export const TARGET_GOOD_FRAMES = 2;

/**
 * Geometri bingkai panduan yang DIGAMBAR di layar.
 *
 * Bingkai ini murni panduan visual supaya pengunjung tahu kira-kira di mana
 * meletakkan HP. Ini BUKAN area yang dipotong dari kamera: memotong berdasarkan
 * tebakan posisi pernah membuat 63% area kamera terbuang dan struk terpotong,
 * jadi frame sekarang dikirim utuh dan pemotongan dilakukan di vision service
 * lewat deteksi area terang.
 */
export const SCAN_GUIDE = {
  widthRatio: 0.62,
  heightRatio: 0.8,
} as const;

/** Style CSS bingkai panduan di layar. */
export function guideFrameStyle(): { width: string; height: string } {
  return {
    width: `${SCAN_GUIDE.widthRatio * 100}%`,
    height: `${SCAN_GUIDE.heightRatio * 100}%`,
  };
}

export type FrameQuality = 'good' | 'fair' | 'poor';

export interface FrameLike {
  sharpness: number;
  /** Bagian piksel terang (0-1). Ada layar HP di depan kamera kalau nilainya tinggi. */
  brightRatio?: number;
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

/** Apakah frame ini benar-benar memuat layar HP (bukan hanya ruangan). */
export function hasScreen(frame: FrameLike | null | undefined): boolean {
  if (!frame || typeof frame.brightRatio !== 'number') return false;
  return frame.brightRatio >= SCREEN_BRIGHT_RATIO;
}

export function classifyFrame(sharpness: number): FrameQuality {
  if (sharpness >= GOOD_SHARPNESS) return 'good';
  if (sharpness >= FAIR_SHARPNESS) return 'fair';
  return 'poor';
}

/**
 * Frame yang layak (layar HP terlihat) DAN cukup tajam.
 *
 * Keduanya diperlukan. Ketajaman saja tidak cukup karena ruangan penuh tekstur
 * mendapat skor ketajaman lebih tinggi daripada struk; keberadaan layar saja
 * tidak cukup karena layar bisa berada jauh atau buram.
 */
export function isFrameUsable(frame: FrameLike): boolean {
  return hasScreen(frame) && classifyFrame(frame.sharpness) !== 'poor';
}

export function countGoodFrames(frames: FrameLike[]): number {
  return (frames || []).filter(isFrameUsable).length;
}

/**
 * Pesan panduan sesuai kondisi gambar saat ini.
 *
 * Pengunjung perlu tahu apakah bingkainya sudah tepat: tanpa umpan balik, satu-
 * satunya tanda yang mereka lihat adalah kegagalan di akhir.
 */
export function scanHint(frame: FrameLike | null, hasAnyFrame: boolean): string {
  if (!hasAnyFrame || !frame) return 'Arahkan bukti bayar (layar sukses) ke kamera';
  if (!hasScreen(frame)) return 'Layar HP belum terlihat — dekatkan ke area scan';
  switch (classifyFrame(frame.sharpness)) {
    case 'good':
      return 'Bagus! Tahan sebentar, sedang membaca...';
    case 'fair':
      return 'Posisikan bukti bayar di dalam area scan';
    default:
      return 'Tahan lebih stabil, gambar masih kurang tajam';
  }
}

/**
 * Dihapus dengan sengaja: TIDAK ADA pengiriman dipercepat.
 *
 * Versi sebelumnya punya `shouldSubmit()` yang mengirim lebih awal begitu
 * "bukti bayar terlihat jelas". Jalur itu berulang kali menghentikan pemindaian
 * sebelum pengunjung selesai mengatur posisi, dan menilai "sudah jelas" dari
 * gambar terbukti rapuh (frame ruangan kosong bisa dinilai lebih tajam daripada
 * frame berisi struk). Jendela waktu 15 detik sudah pendek dan hasil kirimannya
 * sama, jadi percepatan itu hanya menambah risiko. Jangan dikembalikan tanpa
 * pengukuran pada kamera kiosk yang sebenarnya.
 */

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
