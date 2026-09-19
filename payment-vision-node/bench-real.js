/**
 * bench-real.js — uji OCR pada frame webcam NYATA.
 *
 * Berbeda dengan bench-ocr.js (gambar sintetis), di sini masukannya frame asli
 * hasil memotret layar HP dengan webcam. Dari satu frame tajam, dibuat beberapa
 * tingkat blur supaya ketahuan batas kemampuan sistem dan apakah preprocessing
 * benar-benar menolong.
 *
 * Jalankan: node bench-real.js /tmp/cam/real1.jpg 5092
 */
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { createWorker } = require('tesseract.js');
const { extract, collectAmounts } = require('./ocr');
const {
  toGrayscale, stretchContrast, unsharpMask, autoCrop, grayToRgba, scaleGray,
} = require('./preprocess');

const EXPECTED = Number(process.argv[3] || 5092);

/** Blur kotak radius r pada RGBA (meniru kamera tidak fokus). */
function boxBlurRgba(rgba, width, height, radius) {
  if (!radius) return rgba;
  const tmp = Buffer.alloc(rgba.length);
  const out = Buffer.alloc(rgba.length);
  const win = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0; let g = 0; let b = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sx = Math.max(0, Math.min(width - 1, x + k)) * 4;
        const i = (y * width) * 4 + sx;
        r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2];
      }
      const o = (y * width + x) * 4;
      tmp[o] = r / win; tmp[o + 1] = g / win; tmp[o + 2] = b / win; tmp[o + 3] = 255;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0; let g = 0; let b = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sy = Math.max(0, Math.min(height - 1, y + k));
        const i = (sy * width + x) * 4;
        r += tmp[i]; g += tmp[i + 1]; b += tmp[i + 2];
      }
      const o = (y * width + x) * 4;
      out[o] = r / win; out[o + 1] = g / win; out[o + 2] = b / win; out[o + 3] = 255;
    }
  }
  return out;
}

function encode(rgba, width, height, q = 95) {
  return jpeg.encode({ data: Buffer.from(rgba), width, height }, q).data;
}

async function read(worker, rgba, width, height) {
  const { data } = await worker.recognize(encode(rgba, width, height));
  return data.text || '';
}

async function main() {
  const file = process.argv[2] || '/tmp/cam/real1.jpg';
  const decoded = jpeg.decode(fs.readFileSync(file), { useTArray: true });
  const { width, height } = decoded;
  const rgba = Buffer.from(decoded.data);
  console.log(`frame: ${file} (${width}x${height}), tagihan Rp ${EXPECTED}`);

  const worker = await createWorker('eng');
  const rows = [];

  // Radius blur 0 (asli) s/d 12 px pada frame 1552px.
  for (const radius of [0, 2, 4, 6, 8, 10, 12]) {
    const blurred = boxBlurRgba(rgba, width, height, radius);

    // A: apa adanya (setara jalur pass-1 produksi)
    const textA = await read(worker, blurred, width, height);
    const a = extract(textA, EXPECTED).amount;

    // B: preprocessing produksi (auto-crop + kontras + unsharp)
    const prep = autoCrop(toGrayscale(blurred, width, height), width, height);
    const sharp = unsharpMask(stretchContrast(prep.gray), prep.width, prep.height, { radius: 1, amount: 1.1 });
    const b = extract(await read(worker, grayToRgba(sharp, prep.width, prep.height), prep.width, prep.height), EXPECTED).amount;

    // C: preprocessing + upscale 1.5x pada area struk
    const up = scaleGray(sharp, prep.width, prep.height, 1.5);
    const c = extract(await read(worker, grayToRgba(up.gray, up.width, up.height), up.width, up.height), EXPECTED).amount;

    rows.push({ radius, a, b, c });
    const mark = (v) => (v === EXPECTED ? 'OK' : (v == null ? '-' : String(v)));
    console.log(
      `  blur ${String(radius).padStart(2)}px | apa adanya ${mark(a).padEnd(6)} ` +
      `| prep ${mark(b).padEnd(6)} | prep+1.5x ${mark(c).padEnd(6)} ` +
      `| crop ${prep.cropped ? prep.width + 'x' + prep.height : 'tidak'}`
    );
  }

  // Ringkas: radius terbesar yang masih terbaca tiap metode.
  const last = (key) => {
    let best = null;
    for (const r of rows) if (r[key] === EXPECTED) best = r.radius;
    return best;
  };
  console.log('\nblur maksimum yang masih terbaca:');
  console.log(`  apa adanya    : ${last('a') === null ? 'tidak ada' : last('a') + ' px'}`);
  console.log(`  prep          : ${last('b') === null ? 'tidak ada' : last('b') + ' px'}`);
  console.log(`  prep + 1.5x   : ${last('c') === null ? 'tidak ada' : last('c') + ' px'}`);

  // Bila blur berat, laporkan apa yang sebenarnya terbaca supaya jelas ini
  // kehilangan informasi, bukan sekadar ambang yang salah.
  const worst = boxBlurRgba(rgba, width, height, 12);
  const worstText = await read(worker, worst, width, height);
  console.log(`\nblur 12px terbaca: ${JSON.stringify(worstText.replace(/\s+/g, ' ').trim().slice(0, 120))}`);
  console.log(`  kandidat angka: ${JSON.stringify(collectAmounts(worstText).all.slice(0, 6))}`);

  await worker.terminate();
  fs.writeFileSync('/tmp/cam/real-result.json', JSON.stringify(rows, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
