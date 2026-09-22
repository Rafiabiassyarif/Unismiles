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
 * Lebar SELALU dikunci ke kepala cetak, dan tinggi ikut diskalakan dengan faktor
 * yang sama. Itu penting: kalau hanya lebarnya yang dipotong sementara tinggi
 * dibiarkan penuh, rasio gambar berubah (54 x 67 mm jadi 576 x 791 px = 0,73,
 * padahal kertasnya 0,81), sehingga gambar gepeng DAN tepi kanan hilang tanpa
 * pesan error apa pun.
 *
 * Konsekuensinya harus jujur disebutkan: ketika kertas lebih lebar daripada
 * kepala cetak, gambarnya diperkecil supaya muat seluruhnya, bukan dipotong.
 * Semua yang difoto tetap tercetak; yang berkurang hanya skalanya.
 */
export function labelSize(
  widthMm: number,
  heightMm: number,
  printheadPx: number = B1_PRO_PRINTHEAD_PX,
): LabelSize {
  const px = (mm: number) => Math.max(1, Math.round((mm / 25.4) * LABEL_DPI));
  const requestedWidthPx = px(widthMm);
  const requestedHeightPx = px(heightMm);
  const clamped = requestedWidthPx > printheadPx;

  if (!clamped) {
    return { widthPx: requestedWidthPx, heightPx: requestedHeightPx, requestedWidthPx, clamped: false };
  }

  // Skala dengan faktor yang sama untuk lebar dan tinggi, supaya rasio kertas
  // tetap terjaga dan tidak ada bagian gambar yang terpotong.
  const factor = printheadPx / requestedWidthPx;
  return {
    widthPx: printheadPx,
    heightPx: Math.max(1, Math.round(requestedHeightPx * factor)),
    requestedWidthPx,
    clamped: true,
  };
}

/** Konversi milimeter ke piksel pada DPI label. */
export function mmToPx(mm: number, dpi: number = LABEL_DPI): number {
  return Math.max(1, Math.round((mm / 25.4) * dpi));
}


/**
 * Ukuran label (mm) dari pengaturan ukuran kertas Admin.
 *
 * Halaman Pengaturan Admin menyimpan ukuran kertas sebagai string, baik nama
 * preset maupun "CUSTOM 54X67 MM". Fungsi ini menerjemahkannya menjadi ukuran
 * label yang bisa dipakai printer.
 *
 * Bawaan 54 x 67 mm adalah kertas label yang dipakai saat ini. Lebarnya
 * MELEBIHI kepala cetak, jadi `labelSize()` akan mengunci gambarnya ke 576 px
 * dan sisi kanan 5,25 mm tidak tercetak — itu sifat printer, bukan kesalahan
 * di sini, dan sengaja tidak disembunyikan.
 */
export const DEFAULT_LABEL_MM = { widthMm: 54, heightMm: 67 } as const;

export function labelMmFromPaperSize(paperSize: string | null | undefined): { widthMm: number; heightMm: number } {
  const match = String(paperSize || '').trim().match(/CUSTOM\s+(\d{1,3})\s*[X×]\s*(\d{1,3})\s*MM/i);
  if (match) {
    const widthMm = Number(match[1]);
    const heightMm = Number(match[2]);
    // Nilai 0 dari ukuran rusak akan membuat canvas 0 px dan encodeCanvas gagal
    // dengan pesan yang tidak informatif; jatuh ke bawaan lebih berguna.
    if (widthMm > 0 && heightMm > 0) return { widthMm, heightMm };
  }
  return { widthMm: DEFAULT_LABEL_MM.widthMm, heightMm: DEFAULT_LABEL_MM.heightMm };
}


export interface DrawRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** Bidang yang boleh berisi tinta. Di luar ini dibiarkan kosong (putih). */
  clipX: number;
  clipY: number;
  clipW: number;
  clipH: number;
}

/**
 * Posisi dan ukuran gambar di atas label, sesuai mode penyesuaian.
 *
 * Dipisah dari `prepareCanvas` supaya bisa DIEKSEKUSI di test — `prepareCanvas`
 * butuh canvas sungguhan sehingga perhitungannya tidak pernah teruji, dan
 * kesalahan di sini langsung terlihat di kertas sebagai foto gepeng atau
 * bingkai putih.
 *
 *  - 'fit'     : seluruh foto masuk, sisa label jadi putih (ADA bingkai).
 *  - 'cover'   : label terisi penuh, rasio dijaga, kelebihan dipotong (TANPA bingkai).
 *  - 'stretch' : label terisi penuh dengan merusak rasio (gepeng).
 */
export function drawRect(
  mode: 'fit' | 'cover' | 'stretch',
  canvasW: number,
  canvasH: number,
  imgW: number,
  imgH: number,
  offsetYPx = 0,
  offsetXPx = 0,
  marginTopPx = 0,
  marginRightPx = 0,
): DrawRect {
  // Bidang gambar selalu penuh kanvas — supaya tidak ada celah putih di dalam
  // area foto yang muncul tanpa sengaja.
  //
  // MARGIN hanya MEMOTONG bidang itu: piksel di luar margin dibiarkan putih.
  // Foto tetap digambar penuh (cover), lalu dipotong. Itu cara satu-satunya
  // supaya "mulai cetak setelah 0,5 cm" terwujud tanpa mengubah isi foto:
  // menggeser saja tidak bisa membuat ruang kosong, karena gambarnya selalu
  // menutupi seluruh kanvas.
  //
  // Batasannya: margin atas + bawah tidak boleh melebihi tinggi kanvas, dan
  // begitu juga mendatar. Kalau melebihi, tidak ada yang tersisa untuk dicetak.
  const clipX = clampInt(offsetXPx + (marginRightPx < 0 ? -marginRightPx : 0), 0, canvasW);
  const clipY = clampInt(offsetYPx + Math.max(0, marginTopPx), 0, canvasH);
  const rightInset = offsetXPx + Math.max(0, marginRightPx);
  const bottomInset = offsetYPx;
  const clipW = clampInt(canvasW - clipX - Math.max(0, rightInset), 0, canvasW);
  const clipH = clampInt(canvasH - clipY - Math.max(0, bottomInset), 0, canvasH);

  const base: DrawRect = {
    dx: Math.round(offsetXPx),
    dy: Math.round(offsetYPx),
    dw: canvasW,
    dh: canvasH,
    clipX,
    clipY,
    clipW,
    clipH,
  };
  if (mode === 'stretch' || imgW <= 0 || imgH <= 0) return base;

  // fit = muat di dalam (faktor terkecil), cover = penuhi (faktor terbesar).
  // Bedanya hanya min vs max; keduanya MENJAGA rasio, jadi tidak ada gepeng.
  const scale = mode === 'cover'
    ? Math.max(canvasW / imgW, canvasH / imgH)
    : Math.min(canvasW / imgW, canvasH / imgH);

  // +2 px hanya untuk cover: menutup celah sub-piksel akibat pembulatan, supaya
  // tidak ada garis putih tipis di tepi label.
  const pad = mode === 'cover' ? 2 : 0;
  const dw = Math.max(1, Math.round(imgW * scale) + pad);
  const dh = Math.max(1, Math.round(imgH * scale) + pad);

  return {
    ...base,
    dw,
    dh,
    dx: Math.round(offsetXPx + (canvasW - dw) / 2),
    dy: Math.round(offsetYPx + (canvasH - dh) / 2),
  };
}

/** Bulatkan lalu jepit ke rentang, supaya margin tidak pernah menghasilkan nilai negatif. */
function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}


export interface Slot {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Slot pertama dari konfigurasi layout — area yang dibingkai frame saat foto
 * diambil. Inilah satu-satunya bagian yang boleh dicetak.
 *
 * Dipisah dari komponen supaya bisa dieksekusi di test: kesalahan di sini
 * langsung terlihat di kertas sebagai bagian foto yang ikut tercetak di luar
 * bingkai, dan itu tidak akan tertangkap oleh test yang hanya mencocokkan teks.
 *
 * Mengembalikan null kalau slot tidak terbaca — pemanggil harus punya cadangan,
 * bukan diam-diam mencetak seluruh kanvas.
 */
export function firstSlot(
  slots: Slot[] | null | undefined,
): { width: number; height: number } | null {
  const slot = Array.isArray(slots) ? slots[0] : null;
  if (!slot) return null;
  const width = Math.round(Number(slot.width));
  const height = Math.round(Number(slot.height));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}
