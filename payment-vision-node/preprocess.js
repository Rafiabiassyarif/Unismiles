/**
 * preprocess.js — perbaikan citra untuk OCR bukti bayar.
 *
 * Yang TERBUKTI berguna (diukur dengan bench-ocr.js pada struk uji):
 *   - toGrayscale      : membuang informasi warna yang tidak dipakai OCR
 *   - stretchContrast  : meregangkan kontras, tahan pencahayaan tidak merata
 *   - unsharpMask      : mengembalikan ketajaman tepi glyph yang hilang
 *   - brightBounds/crop: memusatkan gambar ke layar HP, bukan latar ruangan
 *
 * Yang TERBUKTI MERUSAK dan sengaja TIDAK dipakai:
 *   - binarisasi Otsu: pada struk terang menghasilkan salah baca (5.068 -> 5.008)
 *     dan tidak pernah memperbaiki kasus yang gagal.
 *   - normalisasi exposure (tarik median): menurunkan hasil (2/5 -> 1/5).
 *
 * Catatan jujur: pada blur berat (radius >= 5 px di frame 1400 px) informasi
 * glyph sudah hilang, sehingga preprocessing apa pun tidak menolong. Perbaikan
 * untuk kasus itu bukan di sisi gambar, melainkan di sisi tangkapan kamera
 * (lihat SCAN_* di PhotoBooth.tsx).
 *
 * Semua fungsi bekerja pada RGBA/luminance mentah supaya bisa diuji tanpa
 * gambar dan tanpa dependensi native.
 */

/** Ambang kecerahan untuk menganggap piksel termasuk layar HP. */
const SCREEN_MIN_BRIGHT = 120;
/** Rasio minimum baris/kolom terang agar dianggap bagian layar. */
const SCREEN_MIN_RUN_RATIO = 0.06;

function toGrayscale(data, width, height) {
  const out = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    out[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return out;
}

/** Peregangan kontras berbasis persentil; tahan outlier pencahayaan. */
function stretchContrast(gray, { lowPercentile = 0.02, highPercentile = 0.98 } = {}) {
  const sorted = Float32Array.from(gray).sort();
  const low = sorted[Math.floor(sorted.length * lowPercentile)];
  const high = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * highPercentile))];
  if (!(high > low)) return gray;

  const out = new Float32Array(gray.length);
  const scale = 255 / (high - low);
  for (let i = 0; i < gray.length; i += 1) {
    out[i] = Math.max(0, Math.min(255, (gray[i] - low) * scale));
  }
  return out;
}

/** Box blur terpisah (horizontal lalu vertikal) sebagai pendekatan Gaussian. */
function boxBlur(gray, width, height, radius) {
  const temp = new Float32Array(gray.length);
  const out = new Float32Array(gray.length);
  const window = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        sum += gray[y * width + Math.max(0, Math.min(width - 1, x + k))];
      }
      temp[y * width + x] = sum / window;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        sum += temp[Math.max(0, Math.min(height - 1, y + k)) * width + x];
      }
      out[y * width + x] = sum / window;
    }
  }
  return out;
}

/** Unsharp mask: out = asli + amount * (asli - blur). Dipakai untuk menajamkan. */
function unsharpMask(gray, width, height, { radius = 1, amount = 1.1 } = {}) {
  const blurred = boxBlur(gray, width, height, radius);
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    out[i] = Math.max(0, Math.min(255, gray[i] + amount * (gray[i] - blurred[i])));
  }
  return out;
}

/**
 * Kotak area terang (layar HP) di dalam frame kamera.
 * Tujuannya memusatkan OCR pada bukti bayar, bukan latar ruangan kiosk.
 */
function brightBounds(gray, width, height, {
  minBright = SCREEN_MIN_BRIGHT,
  minRunRatio = SCREEN_MIN_RUN_RATIO,
} = {}) {
  const colHits = new Int32Array(width);
  const rowHits = new Int32Array(height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (gray[y * width + x] >= minBright) {
        colHits[x] += 1;
        rowHits[y] += 1;
      }
    }
  }

  let x0 = 0;
  let x1 = width - 1;
  let y0 = 0;
  let y1 = height - 1;
  const colMin = Math.max(1, Math.floor(height * minRunRatio));
  const rowMin = Math.max(1, Math.floor(width * minRunRatio));
  while (x0 < width && colHits[x0] < colMin) x0 += 1;
  while (x1 > x0 && colHits[x1] < colMin) x1 -= 1;
  while (y0 < height && rowHits[y0] < rowMin) y0 += 1;
  while (y1 > y0 && rowHits[y1] < rowMin) y1 -= 1;

  return { x0, y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Potong area kotak dari gambar grayscale. */
function cropGray(gray, width, height, box) {
  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(height - 1, Math.max(0, box.y0 + y));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(width - 1, Math.max(0, box.x0 + x));
      out[y * w + x] = gray[sy * width + sx];
    }
  }
  return { gray: out, width: w, height: h };
}

/**
 * Auto-crop HANYA kalau kotak terang memang layak: cukup besar untuk berisi
 * teks, tapi bukan seluruh frame. Kalau tidak, gambar dipakai apa adanya supaya
 * crop yang salah tidak membuang teks struk.
 */
function autoCrop(gray, width, height, opts = {}) {
  const box = brightBounds(gray, width, height, opts);
  const areaRatio = (box.width * box.height) / (width * height);
  const bigEnough = box.width >= width * 0.15 && box.height >= height * 0.05;
  if (!bigEnough || areaRatio > 0.92) return { gray, width, height, cropped: false };
  const result = cropGray(gray, width, height, box);
  return { ...result, cropped: true, box };
}

/** Skala untuk membesarkan gambar bila teksnya masih kecil bagi Tesseract. */
function scaleGray(gray, width, height, scale) {
  if (scale <= 1.0001) return { gray, width, height };
  const nw = Math.round(width * scale);
  const nh = Math.round(height * scale);
  const out = new Float32Array(nw * nh);

  for (let y = 0; y < nh; y += 1) {
    const sy = Math.min(height - 1, y / scale);
    const y0 = Math.floor(sy);
    const y1 = Math.min(height - 1, y0 + 1);
    const wy = sy - y0;
    for (let x = 0; x < nw; x += 1) {
      const sx = Math.min(width - 1, x / scale);
      const x0 = Math.floor(sx);
      const x1 = Math.min(width - 1, x0 + 1);
      const wx = sx - x0;
      const top = gray[y0 * width + x0] * (1 - wx) + gray[y0 * width + x1] * wx;
      const bottom = gray[y1 * width + x0] * (1 - wx) + gray[y1 * width + x1] * wx;
      out[y * nw + x] = top * (1 - wy) + bottom * wy;
    }
  }
  return { gray: out, width: nw, height: nh };
}

/** Luminance satu kanal -> RGBA supaya bisa dikodekan ulang ke JPEG. */
function grayToRgba(gray, width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const v = Math.max(0, Math.min(255, Math.round(gray[i])));
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * Satu varian gambar siap-OCR: auto-crop, regangkan kontras, lalu tajamkan.
 * Dipakai sebagai percobaan KEDUA setelah OCR mentah gagal, sehingga jalur
 * cepat tetap cepat dan tidak pernah lebih buruk dari sebelumnya.
 */
function prepareForOcr(rgba, width, height, { sharpen = true } = {}) {
  const gray = toGrayscale(rgba, width, height);
  const cropped = autoCrop(gray, width, height);
  let prepared = stretchContrast(cropped.gray);
  if (sharpen) {
    prepared = unsharpMask(prepared, cropped.width, cropped.height, { radius: 1, amount: 1.1 });
  }
  return { gray: prepared, width: cropped.width, height: cropped.height, cropped: cropped.cropped };
}

module.exports = {
  toGrayscale,
  stretchContrast,
  boxBlur,
  unsharpMask,
  brightBounds,
  cropGray,
  autoCrop,
  scaleGray,
  grayToRgba,
  prepareForOcr,
  SCREEN_MIN_BRIGHT,
  SCREEN_MIN_RUN_RATIO,
};
