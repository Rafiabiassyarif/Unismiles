/**
 * Geometri label termal — perhitungan murni, tanpa dependensi.
 *
 * Dipisah dari `niimbotPrinter.ts` supaya bisa benar-benar DIEKSEKUSI di test
 * tanpa Web Bluetooth maupun library printer. Perhitungan lebar adalah bagian
 * yang paling menentukan hasil cetak (salah 9 px = tepi label terpotong tanpa
 * error), jadi ia tidak boleh hanya diuji dengan memeriksa teks kode.
 */

/**
 * Lebar kepala cetak B1 Pro menurut PENGUKURAN DI KERTAS pada unit yang dipakai
 * UniSmiles: kolom 0-575 keluar, kolom 576 ke atas tidak, tanpa pesan error.
 *
 * CATATAN PENTING: NiimBlueLib (`@mmote/niimbluelib`) menulis 567 untuk model
 * B1_PRO. Angka itu berasal dari tabel model, bukan dari unit ini. Selisihnya
 * 9 px ≈ 0,76 mm — cukup untuk memotong tepi label. Karena pengukuran langsung
 * lebih kuat daripada tabel, yang dipakai adalah 576.
 *
 * Kalau nanti berganti unit printer, UKUR LAGI jangan salin angka ini.
 */
export const B1_PRO_PRINTHEAD_PX = 576;

/** DPI label B1 Pro (dari tabel model NiimBlueLib). */
export const LABEL_DPI = 300;

export interface LabelSize {
  /** Lebar gambar yang dikirim ke printer (px). Selalu dikunci ke kepala cetak. */
  widthPx: number;
  /** Tinggi gambar (px). */
  heightPx: number;
  /** Lebar kertas yang diminta (px), sebelum dikunci. */
  requestedWidthPx: number;
  /** Benar bila lebar terpaksa dipotong karena melebihi kepala cetak. */
  clamped: boolean;
}

/**
 * Hitung ukuran gambar untuk label dari ukuran kertas dalam milimeter.
 *
 * Lebar SELALU dikunci ke kepala cetak. Gambar yang lebih lebar tidak akan
 * tercetak utuh dan printer tidak memberi error apa pun — hasilnya cuma
 * terpotong diam-diam. Melebihi lebar kepala cetak karena itu bukan pilihan
 * yang tersedia, hanya keadaan yang perlu dilaporkan.
 */
export function labelSize(
  widthMm: number,
  heightMm: number,
  printheadPx: number = B1_PRO_PRINTHEAD_PX,
): LabelSize {
  const px = (mm: number) => Math.max(1, Math.round((mm / 25.4) * LABEL_DPI));
  const requestedWidthPx = px(widthMm);
  const widthPx = Math.min(requestedWidthPx, printheadPx);
  return {
    widthPx,
    heightPx: px(heightMm),
    requestedWidthPx,
    clamped: requestedWidthPx > printheadPx,
  };
}

/** Konversi milimeter ke piksel pada DPI label. */
export function mmToPx(mm: number, dpi: number = LABEL_DPI): number {
  return Math.max(1, Math.round((mm / 25.4) * dpi));
}
