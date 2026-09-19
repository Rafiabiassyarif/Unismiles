/**
 * Kebijakan pemindaian bukti bayar.
 *
 * Model yang dipakai sekarang: TIDAK ADA BATAS WAKTU.
 *
 * Prinsipnya: kalau tangkapannya sudah benar, di situ berarti berhasil dan
 * pengunjung lanjut ke halaman berikutnya. Tidak ada "gagal karena waktu habis",
 * jadi pengunjung boleh mengatur posisi sesuka hatinya.
 *
 * Ini sekaligus menghapus sumber masalah sebelumnya. Dulu pemindaian dibatasi
 * 15 detik lalu dikirim sekali; akibatnya salah menilai "sudah jelas" membuat
 * pengunjung kehilangan kesempatan (keluhan: "ngescan cepat banget, ngatur
 * posisi aja susah"). Sekarang kirim terlalu awal tidak merugikan: hasilnya
 * dievaluasi, kalau belum cocok pemindaian LANJUT lagi tanpa menghukum siapa pun.
 *
 * Dipisah dari komponen supaya bisa diuji tanpa browser.
 */

/** Jeda antar percobaan frame. Cukup cepat agar terasa real-time. */
export const SCAN_FRAME_GAP_MS = 400;

/**
 * Jeda sebelum frame pertama diambil, sejak layar pemindaian terbuka.
 *
 * Kamera butuh waktu menyesuaikan exposure, dan pengunjung butuh waktu sejenak
 * mengangkat HP ke depan lensa.
 */
export const SCAN_READ_DELAY_MS = 1500;

/** Batas frame per kiriman, supaya unggahan dan OCR tetap ringan. */
export const MAX_FRAMES_TO_SEND = 6;

/**
 * Cukup frame layak sebelum satu batch dikirim untuk dinilai.
 *
 * Dua, bukan satu: satu frame bisa kebetulan lolos penilaian padahal gambarnya
 * tidak mewakili. Karena tidak ada batas waktu, menunggu frame kedua tidak
 * merugikan pengunjung.
 */
export const TARGET_USABLE_FRAMES = 2;

/**
 * Batas jumlah kiriman per sesi.
 *
 * Backend membatasi 6 percobaan per sesi. Sisakan dua untuk tombol "Coba Scan
 * Lagi", supaya pengunjung tidak bisa mengunci dirinya sendiri di jalan buntu.
 */
export const MAX_SUBMIT_ROUNDS = 4;

/**
 * Batas menunggu jawaban vision service untuk satu kiriman.
 *
 * Ini BUKAN batas waktu pengunjung: ini hanya menjaga agar layar tidak
 * menggantung selamanya kalau layanan OCR bermasalah.
 */
export const SUBMIT_POLL_TIMEOUT_MS = 25_000;

/** Jeda antar frame saat menunggu jawaban, supaya UI tetap responsif. */
export const SUBMIT_POLL_INTERVAL_MS = 1000;

/**
 * Ambang ketajaman (variance Laplacian).
 *
 * PENTING: nilai ini HANYA untuk memberi tahu pengunjung apakah gambar sudah
 * jelas, dan dipasangkan dengan deteksi keberadaan layar.
 *
 * Pengukuran pada frame kamera nyata menunjukkan ukuran ini tidak bisa berdiri
 * sendiri:
 *   kamera menghadap ruangan, TANPA bukti bayar -> ketajaman 1694-1955
 *   kamera menghadap struk                      -> ketajaman 590
 * Ruangan penuh tekstur justru bernilai lebih tinggi, jadi ketajaman saja pernah
 * membuat sistem menyimpulkan "sudah jelas" padahal tidak ada bukti bayar.
 */
export const GOOD_SHARPNESS = 300;
export const FAIR_SHARPNESS = 120;

/**
 * Bagian piksel yang terang. Penanda yang benar untuk "ada layar HP di depan
 * kamera": diukur pada frame nyata, menghadap struk = 97% piksel terang,
 * menghadap ruangan = 1,6%.
 */
export const SCREEN_BRIGHT_RATIO = 0.12;

/**
 * Geometri bingkai panduan yang DIGAMBAR di layar.
 *
 * Murni panduan visual supaya pengunjung tahu kira-kira di mana meletakkan HP.
 * Ini BUKAN area yang dipotong dari kamera: memotong berdasarkan tebakan posisi
 * pernah membuat 63% area kamera terbuang dan struk terpotong, jadi frame
 * dikirim utuh dan pemotongan dilakukan di vision service lewat deteksi area
 * terang.
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
 * Dua syarat, keduanya perlu: ketajaman saja menipu (lihat catatan
 * GOOD_SHARPNESS), sedangkan keberadaan layar saja tidak cukup karena layar bisa
 * jauh atau buram.
 */
export function isFrameUsable(frame: FrameLike): boolean {
  return hasScreen(frame) && classifyFrame(frame.sharpness) !== 'poor';
}

export function countGoodFrames(frames: FrameLike[]): number {
  return (frames || []).filter(isFrameUsable).length;
}

/**
 * Apakah batch sekarang sudah layak dikirim untuk dinilai.
 *
 * Karena tidak ada batas waktu, hanya ini yang menentukan kapan kirim. Tidak ada
 * jalur "gagal karena kehabisan waktu".
 */
export function shouldSubmitBatch(frames: FrameLike[]): boolean {
  return countGoodFrames(frames) >= TARGET_USABLE_FRAMES;
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
      return 'Tangkapan bagus! Memeriksa bukti bayar...';
    case 'fair':
      return 'Posisikan bukti bayar di dalam area scan';
    default:
      return 'Tahan lebih stabil, gambar masih kurang tajam';
  }
}

/**
 * Simpan hanya N frame terbaik menurut ketajaman.
 *
 * Pemindaian berjalan terus-menerus, jadi tanpa pembatasan ini ratusan frame
 * akan menumpuk di memori dan ikut terunggah.
 */
export function keepBestFrames<T extends FrameLike>(frames: T[], incoming: T, max = MAX_FRAMES_TO_SEND): T[] {
  const next = [...(frames || []), incoming].sort((a, b) => b.sharpness - a.sharpness);
  return next.slice(0, max);
}

/** Frame dikirim paling tajam lebih dulu, sisanya sebagai cadangan. */
export function orderFramesForUpload<T extends FrameLike>(frames: T[]): T[] {
  return [...(frames || [])].sort((a, b) => b.sharpness - a.sharpness);
}
