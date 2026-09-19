/**
 * Kebijakan pemindaian bukti bayar.
 *
 * PELAJARAN PENTING — jangan ulangi kesalahan ini.
 *
 * Dua kali sebelumnya "kualitas gambar" dipakai sebagai ukuran keberhasilan, dan
 * dua-duanya menipu:
 *   1. Ketajaman (variance Laplacian). Diukur di kamera nyata: ruangan kosong
 *      1694-1955, struk 590. Ruangan kosong justru menang, jadi sistem
 *      menyimpulkan "sudah jelas" padahal tidak ada bukti bayar.
 *   2. Kecerahan (bagian piksel terang). Diukur di Mac: struk 97%, ruangan 1,6%.
 *      Tetapi pada kamera kiosk yang menghadap lingkungan terang, ambang ini
 *      lolos TANPA bukti bayar. Ditambah lagi diukur setelah filter
 *      kontras/kecerahan diterapkan, sehingga semakin bias ke terang.
 *
 * Kesimpulan: dari gambar saja, kita TIDAK bisa tahu apakah bukti bayar terbaca
 * atau tidak. Satu-satunya sumber kebenaran adalah hasil OCR dari backend.
 *
 * Karena itu kebijakan di sini sengaja bodoh:
 *   - Kirim batch secara berkala (tidak menunggu "kelihatan bagus").
 *   - Berhasil = backend bilang nominalnya cocok. Titik.
 *   - Tidak ada klaim "terbaca jelas" ke pengunjung, karena kita tidak tahu.
 *
 * Efek sampingnya justru menyelesaikan keluhan "lama sekali ngescan": pengiriman
 * berjalan dengan tempo tetap dan berhenti pada keputusan final, bukan berputar
 * mengejar kondisi gambar yang mungkin tidak pernah tercapai.
 */

/** Jeda antar pengambilan frame. */
export const SCAN_FRAME_GAP_MS = 400;

/**
 * Jeda sebelum frame pertama diambil, sejak layar terbuka.
 * Kamera butuh menyesuaikan exposure, dan pengunjung butuh waktu mengangkat HP.
 */
export const SCAN_READ_DELAY_MS = 1500;

/**
 * Tempo pengiriman batch ke backend.
 *
 * Dikirim berkala supaya ada kemajuan pasti, tanpa menunggu kondisi gambar yang
 * tidak bisa dipercaya. 2,5 detik cukup untuk mengumpulkan beberapa frame dan
 * cukup cepat terasa responsif.
 */
export const SUBMIT_INTERVAL_MS = 2500;

/** Jumlah frame yang disimpan per batch, supaya unggahan dan OCR tetap ringan. */
export const MAX_FRAMES_TO_SEND = 4;

/**
 * Batas jumlah pengiriman per sesi.
 *
 * Backend membatasi 6 percobaan per sesi. Sisakan dua untuk tombol
 * "Coba Scan Lagi", supaya pengunjung tidak bisa mengunci diri di jalan buntu.
 */
export const MAX_SUBMIT_ROUNDS = 4;

/** Penjaga agar layar tidak menggantung kalau layanan OCR bermasalah. */
export const SUBMIT_POLL_TIMEOUT_MS = 20_000;
export const SUBMIT_POLL_INTERVAL_MS = 1000;

/**
 * Geometri bingkai panduan yang DIGAMBAR di layar.
 *
 * Murni panduan visual. Ini BUKAN area yang dipotong dari kamera: memotong
 * berdasarkan tebakan posisi pernah membuat 63% area kamera terbuang dan struk
 * terpotong. Frame dikirim utuh; pemotongan dilakukan di vision service.
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

export interface FrameLike {
  sharpness: number;
}

/**
 * Apakah sudah waktunya mengirim batch.
 *
 * Hanya berbasis jumlah frame dan waktu — TIDAK ada penilaian kualitas gambar,
 * karena itu terbukti tidak bisa dipercaya.
 */
export function shouldSubmitBatch(frames: FrameLike[], msSinceLastSubmit: number): boolean {
  if (!frames || frames.length === 0) return false;
  return msSinceLastSubmit >= SUBMIT_INTERVAL_MS;
}

/** Simpan hanya N frame terbaik menurut ketajaman, supaya memori terkendali. */
export function keepBestFrames<T extends FrameLike>(frames: T[], incoming: T, max = MAX_FRAMES_TO_SEND): T[] {
  const next = [...(frames || []), incoming].sort((a, b) => b.sharpness - a.sharpness);
  return next.slice(0, max);
}

/** Frame paling tajam dikirim lebih dulu, sisanya sebagai cadangan. */
export function orderFramesForUpload<T extends FrameLike>(frames: T[]): T[] {
  return [...(frames || [])].sort((a, b) => b.sharpness - a.sharpness);
}

/**
 * Pesan status yang HONEST — tidak mengklaim sesuatu yang tidak kita ketahui.
 *
 * Tidak ada lagi "terbaca jelas" / "tangkapan bagus", karena kita memang tidak
 * bisa tahu dari gambar. Yang bisa dikatakan hanya apa yang sedang terjadi.
 */
export function scanStatusText(rounds: number, maxRounds: number): string {
  if (rounds <= 0) return 'Arahkan bukti bayar (layar sukses) ke kamera';
  return `Belum terbaca — tahan bukti bayar di area scan (percobaan ${rounds + 1}/${maxRounds})`;
}

/** Pesan saat sedang memeriksa. */
export const CHECKING_TEXT = 'Sedang membaca bukti bayar...';
