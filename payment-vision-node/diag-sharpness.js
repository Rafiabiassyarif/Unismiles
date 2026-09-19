/**
 * diag-sharpness.js — ukur nilai ketajaman frame kamera NYATA.
 *
 * Dugaan: optimasi "kirim lebih awal kalau bukti bayar sudah jelas" memakai
 * variance Laplacian sebagai ukuran. Kamera yang diarahkan ke ruangan biasa
 * (banyak tekstur) juga punya variance tinggi, sehingga dianggap "jelas" padahal
 * tidak ada bukti bayar sama sekali. Akibatnya pemindaian berhenti dalam ~1 detik.
 *
 * Skrip ini memakai algoritma yang sama persis dengan measureSharpness di
 * PhotoBooth.tsx, dijalankan pada frame kamera nyata.
 */
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');

/** Samakan dengan GOOD_SHARPNESS / FAIR_SHARPNESS di services/scanWindow.ts. */
const GOOD_SHARPNESS = 300;
const FAIR_SHARPNESS = 120;

/** Salinan measureSharpness dari PhotoBooth.tsx (downscale 240 px + Laplacian). */
function measureSharpness(rgba, sourceWidth, sourceHeight) {
  const w = 240;
  const h = Math.max(1, Math.round((sourceHeight / sourceWidth) * w));

  // Downscale bilinear sederhana ke lebar 240 px.
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

/** Bagian piksel yang terang: indikasi ada layar HP di dalam frame. */
function brightRatio(rgba, width, height, threshold = 180) {
  let bright = 0;
  let total = 0;
  for (let i = 0; i < width * height; i += 3) {
    const l = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    if (l >= threshold) bright += 1;
    total += 1;
  }
  return bright / Math.max(1, total);
}

function classify(sharpness) {
  if (sharpness >= GOOD_SHARPNESS) return 'good  (memicu kirim lebih awal)';
  if (sharpness >= FAIR_SHARPNESS) return 'fair';
  return 'poor';
}

const files = process.argv.slice(2);
let triggered = 0;

for (const file of files) {
  const decoded = jpeg.decode(fs.readFileSync(file), { useTArray: true });
  const sharpness = measureSharpness(decoded.data, decoded.width, decoded.height);
  const bright = brightRatio(decoded.data, decoded.width, decoded.height);
  const verdict = classify(sharpness);
  if (sharpness >= GOOD_SHARPNESS) triggered += 1;
  console.log(
    `${path.basename(file).padEnd(22)} ketajaman=${String(Math.round(sharpness)).padStart(6)} ` +
    `terang=${(bright * 100).toFixed(1)}%  -> ${verdict}`
  );
}

console.log(`\n${files.length} frame diuji, ${triggered} di antaranya dianggap "jelas"`);
if (triggered > 0) {
  console.log('KESIMPULAN: ambang memicu kirim-lebih-awal pada frame TANPA bukti bayar.');
} else {
  console.log('KESIMPULAN: ambang tidak salah picu pada frame ini.');
}
