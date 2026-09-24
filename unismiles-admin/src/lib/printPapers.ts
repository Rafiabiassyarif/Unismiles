/**
 * Katalog kertas label + geometri kotak cetak, dan rencana preview cetak.
 *
 * KENAPA MODUL TERPISAH, BUKAN DI DALAM KOMPONEN
 * Yang menentukan hasil di kertas adalah hitungannya, bukan tampilannya. Semua
 * angka di sini MURNI (tanpa DOM, tanpa React) supaya bisa DIEKSEKUSI di test —
 * kesalahan satu piksel di sini terlihat di kertas sebagai tepi foto yang
 * keluar dari bingkai, dan itu tidak akan tertangkap oleh test yang hanya
 * mencocokkan teks.
 *
 * KENAPA ANGKANYA DISALIN, BUKAN DIKARANG
 * Angka geometri di bawah adalah cerminan `unismiles-photobooth/services/labelGeometry.ts`
 * dan `unismiles-backend/utils/paperSizes.js`. Kalau ketiganya berbeda, panel
 * akan menampilkan preview yang tidak sama dengan yang dicetak — jadi salinan
 * ini diuji SILANG terhadap kedua sumber itu, bukan diuji terhadap dirinya
 * sendiri. Kalau salah satu diubah, test silang akan gagal dan itu memang
 * tujuannya.
 */

/** Lebar kepala cetak B1 Pro, dari PENGUKURAN DI KERTAS (bukan tabel library). */
export const PRINTHEAD_PX = 576;
/** DPI label B1 Pro. */
export const DPI = 300;
/** Ambang hitam-putih, sama dengan photobooth. */
export const ONE_BIT_THRESHOLD = 128;

export const mmToPx = (mm: number): number => Math.max(1, Math.round((mm / 25.4) * DPI));
export const pxToMm = (px: number): number => (px * 25.4) / DPI;

export interface Margin {
  topPx: number;
  rightPx: number;
  leftPx: number;
  bottomPx: number;
}

/**
 * Kotak cetak label Polaroid SNS 54 x 67 mm, DIUKUR DI KERTAS dan sudah pas.
 *
 * Ini satu-satunya preset yang marginnya terukur. Kertas berbingkai lain dari
 * katalog belum diukur, jadi marginnya TIDAK dikarang di sini — panel meminta
 * operator mengisinya, dan preview menunjukkan akibatnya sebelum dicetak.
 * (Preset backend menang untuk kertas ini; lihat printMargin di bawah.)
 */
export const MEASURED_FRAME: Margin = { topPx: 70, rightPx: 83, leftPx: 0, bottomPx: 154 };

export type PaperKind = 'plain' | 'framed' | 'twoColor';

export interface PaperOption {
  /** Nilai yang dikirim ke API sebagai paper_size. */
  value: string;
  /** Nama pendek untuk dropdown. */
  label: string;
  widthMm: number;
  heightMm: number;
  kind: PaperKind;
  /** Keterangan yang ditampilkan di bawah dropdown. */
  note: string;
}

/** Ukuran kertas kustom, format yang diterima backend. */
export const customSize = (w: number, h: number) => `CUSTOM ${w}X${h} MM`;

/**
 * Kertas foto B21 Pro dari katalog resmi NIIMBOT.
 *
 * Sumber: https://niimbots.com/products/photo-papers-red-black-labels-only-for-b21-pro-300dpi-label-maker
 * Ukuran diambil dari nama variannya apa adanya. Jenisnya dibedakan karena
 * menentukan apa yang harus dilakukan operator:
 *
 *   plain    — kertas kosong. Foto boleh memakai seluruh area cetak.
 *   framed   — bingkai/desain SUDAH tercetak. Foto hanya boleh mengisi kotak
 *              putihnya, jadi marginnya harus diisi dari hasil ukur di kertas.
 *   twoColor — kertas dua warna (merah & hitam). Printer hanya bisa
 *              hitam-putih pada jalur ini, jadi warnanya akan hilang.
 */
export const PAPER_CATALOG: readonly PaperOption[] = [
  {
    value: 'nimbotpaper-polaroid',
    label: '54 × 67 mm — SNS (bingkai)',
    widthMm: 54, heightMm: 67, kind: 'framed',
    note: 'Kotak cetak sudah terukur: 555 × 567 px di x=0 y=70. Angka ini terkunci, tidak ikut berubah walau margin diisi lain.',
  },
  {
    value: customSize(54, 67),
    label: '54 × 67 mm — Best Years (bingkai)',
    widthMm: 54, heightMm: 67, kind: 'framed',
    note: 'Bingkai tercetak. Isi margin sesuai ukur di kertas, jangan biarkan 0.',
  },
  {
    value: customSize(54, 74),
    label: '54 × 74 mm — Best Day (bingkai)',
    widthMm: 54, heightMm: 74, kind: 'framed',
    note: 'Bingkai tercetak. Isi margin sesuai ukur di kertas, jangan biarkan 0.',
  },
  {
    value: customSize(54, 84),
    label: '54 × 84 mm — Time & Memory (bingkai)',
    widthMm: 54, heightMm: 84, kind: 'framed',
    note: 'Bingkai tercetak. Isi margin sesuai ukur di kertas, jangan biarkan 0.',
  },
  {
    value: customSize(54, 80),
    label: '54 × 80 mm — White (polos)',
    widthMm: 54, heightMm: 80, kind: 'plain',
    note: 'Kertas kosong: foto memakai seluruh area cetak yang terjangkau.',
  },
  {
    value: customSize(50, 80),
    label: '50 × 80 mm — Red & Black',
    widthMm: 50, heightMm: 80, kind: 'twoColor',
    note: 'Dua warna (merah & hitam). Jalur cetak ini hanya hitam-putih, jadi bagian merahnya tidak bisa ikut.',
  },
  {
    value: customSize(50, 30),
    label: '50 × 30 mm — Red & Black',
    widthMm: 50, heightMm: 30, kind: 'twoColor',
    note: 'Dua warna (merah & hitam). Hanya hitam yang bisa dicetak dari jalur ini.',
  },
  {
    value: customSize(51, 51),
    label: '51 × 51 mm — Red & Black (bulat)',
    widthMm: 51, heightMm: 51, kind: 'twoColor',
    note: 'Label bulat dua warna. Hanya hitam yang bisa dicetak dari jalur ini.',
  },
  {
    value: customSize(38, 70),
    label: '38 × 70 mm — Red & Black',
    widthMm: 38, heightMm: 70, kind: 'twoColor',
    note: 'Dua warna (merah & hitam). Hanya hitam yang bisa dicetak dari jalur ini.',
  },
  {
    value: customSize(40, 30),
    label: '40 × 30 mm — polos',
    widthMm: 40, heightMm: 30, kind: 'plain',
    note: 'Kertas kosong: foto memakai seluruh area cetak yang terjangkau.',
  },
] as const;

/** Kertas berbingkai = marginnya wajib diisi operator, bukan dibiarkan 0. */
export const isFramed = (paper: PaperOption | null | undefined) =>
  paper?.kind === 'framed' && paper.value !== 'nimbotpaper-polaroid';

/** Cari entri katalog; null untuk ukuran kustom di luar katalog. */
export function findPaper(paperSize: string | null | undefined): PaperOption | null {
  const text = String(paperSize || '').trim();
  return PAPER_CATALOG.find(p => p.value === text)
    || PAPER_CATALOG.find(p => p.value.toLowerCase() === text.toLowerCase())
    || null;
}

/** Ukuran kertas (mm) dari nilai paper_size, termasuk format CUSTOM. */
export function paperMm(paperSize: string | null | undefined): { widthMm: number; heightMm: number } {
  const found = findPaper(paperSize);
  if (found) return { widthMm: found.widthMm, heightMm: found.heightMm };
  const m = String(paperSize || '').trim().match(/CUSTOM\s+(\d{1,3})\s*[X×]\s*(\d{1,3})\s*MM/i);
  if (m && Number(m[1]) > 0 && Number(m[2]) > 0) return { widthMm: Number(m[1]), heightMm: Number(m[2]) };
  // Bawaan sama dengan photobooth, supaya preview tidak menampilkan kertas lain
  // saat nilainya belum terbaca.
  return { widthMm: 54, heightMm: 67 };
}

export interface Box { x: number; y: number; w: number; h: number }

/**
 * Kotak cetak dari margin empat sisi — cerminan `printBox()` photobooth.
 *
 * UKURAN ditentukan HANYA oleh margin; offset tidak pernah mengubahnya (kalau
 * ikut berubah, yang terjadi bukan kalibrasi melainkan crop). Yang dibatasi
 * hanya tempat berhentinya: tidak boleh keluar kertas maupun kepala cetak.
 */
export function printBox(
  canvasW: number, canvasH: number, margin: Margin,
  printheadPx: number = PRINTHEAD_PX, offsetXPx = 0, offsetYPx = 0,
): Box {
  const maxW = Math.max(0, Math.min(canvasW, printheadPx));
  const w = clamp(canvasW - Math.max(0, margin.leftPx) - Math.max(0, margin.rightPx), 0, maxW);
  const h = clamp(canvasH - Math.max(0, margin.topPx) - Math.max(0, margin.bottomPx), 0, canvasH);
  const x = clamp(Math.max(0, margin.leftPx) + offsetXPx, 0, Math.max(0, maxW - w));
  const y = clamp(Math.max(0, margin.topPx) + offsetYPx, 0, Math.max(0, canvasH - h));
  return { x, y, w, h };
}

/**
 * Posisi gambar di dalam kotak — cerminan `drawRect()` photobooth.
 * cover = kotak terisi penuh (kelebihan dipotong), fit = seluruh foto masuk.
 */
export function drawRect(
  mode: 'fit' | 'cover' | 'stretch',
  box: Box, imgW: number, imgH: number,
): { dx: number; dy: number; dw: number; dh: number } {
  if (mode === 'stretch' || imgW <= 0 || imgH <= 0 || box.w <= 0 || box.h <= 0) {
    return { dx: box.x, dy: box.y, dw: box.w, dh: box.h };
  }
  const scale = mode === 'cover'
    ? Math.max(box.w / imgW, box.h / imgH)
    : Math.min(box.w / imgW, box.h / imgH);
  // +2 px hanya untuk cover: menutup celah sub-piksel supaya tidak ada garis
  // putih tipis di tepi bingkai.
  const pad = mode === 'cover' ? 2 : 0;
  const dw = Math.max(1, Math.round(imgW * scale) + pad);
  const dh = Math.max(1, Math.round(imgH * scale) + pad);
  return {
    dw, dh,
    dx: Math.round(box.x + (box.w - dw) / 2),
    dy: Math.round(box.y + (box.h - dh) / 2),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/**
 * Margin yang BENAR-BENAR dipakai saat mencetak, untuk sebuah konfigurasi.
 *
 * Urutannya penting dan harus sama dengan kiosk: kertas preset label punya
 * margin TERUKUR yang menang atas apa pun yang diisi di panel. Kalau preview
 * memakai urutan yang berbeda, preview-nya berbohong.
 */
export function effectiveMargin(
  paperSize: string | null | undefined,
  configured: Margin,
): { margin: Margin; source: 'measured' | 'configured'; warning: string | null } {
  if (String(paperSize || '').trim().toLowerCase() === 'nimbotpaper-polaroid') {
    return { margin: { ...MEASURED_FRAME }, source: 'measured', warning: null };
  }
  const margin = {
    topPx: Math.max(0, configured.topPx), rightPx: Math.max(0, configured.rightPx),
    leftPx: Math.max(0, configured.leftPx), bottomPx: Math.max(0, configured.bottomPx),
  };
  const kosong = margin.topPx === 0 && margin.rightPx === 0 && margin.leftPx === 0 && margin.bottomPx === 0;
  const paper = findPaper(paperSize);
  const warning = isFramed(paper) && kosong
    ? 'Kertas ini berbingkai, tapi marginnya masih 0 — foto akan menimpa bingkai yang sudah tercetak.'
    : null;
  return { margin, source: 'configured', warning };
}

export interface PreviewPlan {
  /** Ukuran kanvas = ukuran KERTAS pada 300 dpi; tidak dipangkas. */
  canvasW: number;
  canvasH: number;
  box: Box;
  paper: PaperOption | null;
  marginSource: 'measured' | 'configured';
  warning: string | null;
}

/** Rencana preview: ukuran kanvas + kotak cetak, tanpa menyentuh DOM. */
export function previewPlan(
  paperSize: string | null | undefined,
  configured: Margin,
  offsetXPx = 0,
  offsetYPx = 0,
): PreviewPlan {
  const { widthMm, heightMm } = paperMm(paperSize);
  const canvasW = mmToPx(widthMm);
  const canvasH = mmToPx(heightMm);
  const { margin, source, warning } = effectiveMargin(paperSize, configured);
  return {
    canvasW, canvasH,
    box: printBox(canvasW, canvasH, margin, PRINTHEAD_PX, offsetXPx, offsetYPx),
    paper: findPaper(paperSize),
    marginSource: source,
    warning,
  };
}

/**
 * Emulasi jalur cetak produksi: klip ke kotak, gambar foto, lalu dither
 * Floyd–Steinberg ke hitam-putih. Ditiru PERSIS karena inilah yang dilihat
 * printer.
 *
 * `imageData` diubah di tempat. Dipisah dari canvas supaya bisa diuji tanpa DOM.
 */
export function renderPrintBitmap(
  imageData: { data: Uint8ClampedArray | number[]; width: number; height: number },
  opts: {
    plan: PreviewPlan;
    fitMode: 'fit' | 'cover' | 'stretch';
    imgW: number;
    imgH: number;
    /** Warna sumber untuk piksel di dalam kotak; di luar kotak selalu putih. */
    sample: (sx: number, sy: number) => [number, number, number];
    threshold?: number;
  },
): void {
  const { plan, fitMode, imgW, imgH, sample, threshold = ONE_BIT_THRESHOLD } = opts;
  const { data, width } = imageData;
  const r = drawRect(fitMode, plan.box, imgW, imgH);

  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const didalam = x >= plan.box.x && x < plan.box.x + plan.box.w
        && y >= plan.box.y && y < plan.box.y + plan.box.h;
      if (!didalam) {
        // Di luar kotak: putih. Ini yang membuat bingkai tercetak tetap bersih.
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
        continue;
      }
      const sx = Math.floor(imgW * (x - r.dx) / r.dw);
      const sy = Math.floor(imgH * (y - r.dy) / r.dh);
      const [cr, cg, cb] = (sx >= 0 && sy >= 0 && sx < imgW && sy < imgH) ? sample(sx, sy) : [255, 255, 255];
      data[i] = cr; data[i + 1] = cg; data[i + 2] = cb; data[i + 3] = 255;
    }
  }

  // Dithering dibatasi ke kotak: menyebar kesalahan ke luar kotak akan mengubah
  // piksel yang tidak boleh berisi tinta.
  ditherToBlackAndWhite(data, width, imageData.height, threshold, plan.box);
}

/** Terang versi mata manusia (Rec. 601) — sama dengan photobooth. */
export const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Dither Floyd–Steinberg, disalin dari `unismiles-photobooth/services/oneBitImage.ts`.
 *
 * Kenapa disalin: encoder NiimBlueLib mencetak setiap piksel yang bukan putih
 * murni sebagai tinta penuh, dan library tidak menyediakan dithering sama
 * sekali. Tanpa langkah ini seluruh label keluar hitam pekat — jadi preview yang
 * melewatkannya akan menampilkan sesuatu yang tidak pernah dicetak.
 */
export function ditherToBlackAndWhite(
  data: Uint8ClampedArray | number[], width: number, height: number,
  threshold: number = ONE_BIT_THRESHOLD,
  box?: { x: number; y: number; w: number; h: number },
): void {
  const total = width * height;
  if (total <= 0) return;
  let x0 = 0, y0 = 0, x1 = width, y1 = height;
  if (box) {
    x0 = Math.max(0, Math.min(width, Math.round(box.x)));
    y0 = Math.max(0, Math.min(height, Math.round(box.y)));
    x1 = Math.max(x0, Math.min(width, x0 + Math.round(box.w)));
    y1 = Math.max(y0, Math.min(height, y0 + Math.round(box.h)));
  }
  if (x1 <= x0 || y1 <= y0) return;

  const gray = new Float32Array(total);
  for (let p = 0; p < total; p += 1) {
    const i = p * 4;
    const alpha = data[i + 3];
    gray[p] = alpha === 0 ? 255 : luminance(data[i], data[i + 1], data[i + 2]);
  }

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = y * width + x;
      const oldValue = gray[p];
      const newValue = oldValue < threshold ? 0 : 255;
      gray[p] = newValue;
      const error = oldValue - newValue;
      if (x + 1 < x1) gray[p + 1] += error * (7 / 16);
      if (y + 1 < y1) {
        if (x > x0) gray[p + width - 1] += error * (3 / 16);
        if (x >= x0 && x < x1) gray[p + width] += error * (5 / 16);
        if (x + 1 < x1) gray[p + width + 1] += error * (1 / 16);
      }
    }
  }

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      const value = gray[p] < threshold ? 0 : 255;
      data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
    }
  }
}

/**
 * Pesan galat kamera, dipetakan dari nama galat browser.
 *
 * Dipisah dan MURNI supaya bisa diuji: kegagalan kamera yang dilaporkan sebagai
 * "sesuatu gagal" membuat operator menebak-nebak, dan di kiosk itu berakhir
 * dengan kamera yang tidak pernah dipakai. Ada di modul ini (bukan di komponen)
 * karena .ts bisa dieksekusi di test, .tsx tidak.
 */
export function cameraErrorMessage(err: unknown): string {
  const name = String((err as { name?: string })?.name || '');
  const pesan = String((err as { message?: string })?.message || '');
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Izin kamera ditolak. Izinkan akses kamera untuk halaman ini di browser, lalu coba lagi.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Tidak ada kamera yang terdeteksi di perangkat ini.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu coba lagi.';
  }
  // Hanya saat TIDAK ada galat bernama (mis. dipanggil sebelum mencoba): kalau
  // browser memang tidak punya getWGU, itu penyebabnya. Galat bernama tetap
  // dilaporkan apa adanya — menyebut "browser tidak mendukung" untuk galat lain
  // akan menyesatkan orang yang mencari masalah di browser.
  if (!name && typeof navigator !== 'undefined' && !navigator?.mediaDevices?.getUserMedia) {
    return 'Browser ini tidak mendukung kamera (butuh https dan Chrome/Edge/Safari terbaru).';
  }
  return `Kamera gagal dibuka${pesan ? `: ${pesan}` : '.'}`;
}

/**
 * Ambil gambar dari elemen video ke sebuah Image, siap dipakai jalur cetak.
 *
 * Menolak video yang belum punya ukuran: kamera belum memberi frame, dan
 * mengembalikan gambar kosong akan membuat operator menyetel brightness pada
 * layar hitam. Butuh `document`, jadi hanya dijalankan di browser.
 */
export function frameToImage(video: { videoWidth: number; videoHeight: number }): Promise<HTMLImageElement> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return Promise.reject(new Error('Kamera belum siap — belum ada gambar yang bisa diambil.'));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(video as unknown as CanvasImageSource, 0, 0, w, h);
  const url = c.toDataURL('image/jpeg', 0.95);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Hasil capture tidak bisa dibaca sebagai gambar.'));
    img.src = url;
  });
}

/**
 * Sesuaikan warna seperti `ctx.filter` di jalur cetak, dengan urutan yang sama:
 * brightness mengalikan, contrast bergerak di sekitar 128, lalu saturation.
 *
 * Dipakai pada PIKEL SUMBER sebelum dither — bukan pada hasil hitam-putih.
 * Kalau diterapkan setelah dither, hasilnya hanya hitam/putih dan penyesuaian
 * tidak berpengaruh apa pun.
 */
export function applyAdjust(
  [r, g, b]: [number, number, number],
  brightness: number, contrast: number, saturation: number,
): [number, number, number] {
  const kb = brightness / 100;
  const kc = contrast / 100;
  const ks = saturation / 100;
  // Terang Rec.601: sama dengan yang dipakai dithering, jadi penyesuaian dan
  // penghitungan hitam-putih tidak memakai ukuran terang yang berbeda.
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const out: number[] = [];
  for (const c of [r, g, b]) {
    let v = c * kb;
    v = (v - 128) * kc + 128;
    v = lum + (v - lum) * ks;
    out.push(Math.max(0, Math.min(255, Math.round(v))));
  }
  return [out[0], out[1], out[2]];
}

/**
 * Resolusi EFEKTIF sumber gambar di dalam kotak cetak.
 *
 * Dua hal berbeda dan sering dicampur:
 *   1. Kanvas selalu 300 dpi — 1 piksel cetak = 1/300 inci. Itu harga mati,
 *      karena seluruh kalibrasi milimeter bergantung padanya.
 *   2. Foto SUMBER belum tentu punya cukup piksel untuk 300 dpi. Kalau kurang,
 *      hasilnya tetap 300 dpi TAPI hasil interpolasi (kabur) — dan itu tidak
 *      terlihat dari angka kotak mana pun.
 *
 * Fungsi ini yang membedakan keduanya, memakai rumus `drawRect` yang sama
 * dengan jalur cetak, jadi angkanya bukan tafsiran.
 */
export function effectiveSourceDpi(
  box: Box, imgW: number, imgH: number, mode: 'fit' | 'cover' | 'stretch',
): { x: number; y: number; min: number; upscaled: boolean; drawnW: number; drawnH: number } {
  if (imgW <= 0 || imgH <= 0 || box.w <= 0 || box.h <= 0) {
    return { x: 0, y: 0, min: 0, upscaled: true, drawnW: 0, drawnH: 0 };
  }
  const r = drawRect(mode, box, imgW, imgH);
  // Berapa piksel SUMBER yang mewakili satu piksel cetak. > 1 berarti sumber
  // lebih rapat dari 300 dpi (aman); < 1 berarti diperbesar (kabur).
  const perX = imgW / Math.max(1, r.dw);
  const perY = imgH / Math.max(1, r.dh);
  const x = DPI * perX;
  const y = DPI * perY;
  return { x, y, min: Math.min(x, y), upscaled: Math.min(x, y) < DPI, drawnW: r.dw, drawnH: r.dh };
}

/** Ringkas: apa yang perlu ditampilkan di panel tentang hasil cetak. */
export function inkSummary(plan: PreviewPlan) {
  const kanan = plan.box.x + plan.box.w;
  return {
    boxLabel: `${plan.box.w} × ${plan.box.h} px di x=${plan.box.x} y=${plan.box.y}`,
    mmLabel: `${pxToMm(plan.box.w).toFixed(2)} × ${pxToMm(plan.box.h).toFixed(2)} mm`,
    rightEdgePx: kanan,
    headroomPx: PRINTHEAD_PX - kanan,
    canvasLabel: `${plan.canvasW} × ${plan.canvasH} px`,
  };
}
