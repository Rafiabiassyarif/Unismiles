/**
 * diag-sharpness.js — periksa apakah sebuah frame kamera layak dibaca.
 *
 * Latar belakang: dulu "berhenti memindai lebih awal" hanya memakai ketajaman
 * (variance Laplacian). Pengukuran pada frame nyata membuktikan ukuran itu
 * TERBALIK:
 *   kamera menghadap ruangan, TANPA bukti bayar -> ketajaman 1694-1955
 *   kamera menghadap struk                      -> ketajaman 590
 * Ruangan penuh tekstur menang, jadi pemindaian berhenti dalam ~1 detik walau
 * tidak ada bukti bayar.
 *
 * Aturan yang benar (sama dengan services/scanWindow.ts) butuh DUA syarat:
 *   ada layar HP (bagian piksel terang) DAN gambar cukup tajam.
 *
 * Skrip ini memakai aturan itu supaya bisa dipakai memeriksa foto asli dari
 * lapangan. Jalankan: node diag-sharpness.js <foto.jpg> [foto2.jpg ...]
 */
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');

/** Samakan dengan services/scanWindow.ts. */
const GOOD_SHARPNESS = 300;
const FAIR_SHARPNESS = 120;
const SCREEN_BRIGHT_RATIO = 0.12;
/** Ambang luminance untuk menganggap piksel termasuk layar HP. */
const BRIGHT_LUMINANCE = 180;

/** Salinan measureSharpness dari PhotoBooth.tsx (downscale 240 px + Laplacian). */
function measureSharpness(rgba, sourceWidth, sourceHeight) {
  const w = 240;
  const h = Math.max(1, Math.round((sourceHeight / sourceWidth) * w));

  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / h));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / w));
      const i = (sy * sourceWidth + sx) * 4;
      lum[y * w + x] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    }
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const c = y * w + x;
      const lap = 4 * lum[c] - lum[c - 1] - lum[c + 1] - lum[c - w] - lum[c + w];
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }
  if (!count) return 0;
  const mean = sum / count;
  return Math.max(0, sumSq / count - mean * mean);
}

/** Salinan measureBrightRatio dari PhotoBooth.tsx. */
function measureBrightRatio(rgba, width, height) {
  let bright = 0;
  let total = 0;
  for (let i = 0; i < width * height; i += 1) {
    const off = i * 4;
    const l = 0.299 * rgba[off] + 0.587 * rgba[off + 1] + 0.114 * rgba[off + 2];
    if (l >= BRIGHT_LUMINANCE) bright += 1;
    total += 1;
  }
  return bright / Math.max(1, total);
}

/** Aturan sama dengan isFrameUsable di scanWindow.ts. */
function verdict(sharpness, brightRatio) {
  const screen = brightRatio >= SCREEN_BRIGHT_RATIO;
  if (!screen) return 'BUKAN layar — scan lanjut, tidak dipercepat';
  if (sharpness < FAIR_SHARPNESS) return 'layar terlihat, tapi terlalu buram';
  if (sharpness < GOOD_SHARPNESS) return 'layar terlihat, cukup tajam';
  return 'layak dipercepat';
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('pakai: node diag-sharpness.js <foto.jpg> [foto2.jpg ...]');
  process.exit(1);
}

let usable = 0;
for (const file of files) {
  const decoded = jpeg.decode(fs.readFileSync(file), { useTArray: true });
  const sharpness = measureSharpness(decoded.data, decoded.width, decoded.height);
  const bright = measureBrightRatio(decoded.data, decoded.width, decoded.height);
  const v = verdict(sharpness, bright);
  if (v === 'layak dipercepat') usable += 1;
  console.log(
    `${path.basename(file).padEnd(22)} ketajaman=${String(Math.round(sharpness)).padStart(6)} ` +
    `terang=${(bright * 100).toFixed(1).padStart(5)}%  -> ${v}`
  );
}

console.log(`\n${files.length} frame diuji, ${usable} layak dipercepat`);
console.log('(frame yang tidak layak membuat pemindaian lanjut sampai jendela waktu habis)');
