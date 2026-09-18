const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { createWorker } = require('tesseract.js');
const { extract } = require('./ocr');
const {
  toGrayscale, stretchContrast, unsharpMask, grayToRgba, otsuThreshold,
} = require('./preprocess');

const EXPECTED = 5068;

function load(file) {
  const d = jpeg.decode(fs.readFileSync(file), { useTArray: true });
  return { gray: toGrayscale(Buffer.from(d.data), d.width, d.height), width: d.width, height: d.height };
}

/**
 * Emulasi filter canvas yang dipakai frontend sekarang:
 * ctx.filter = 'contrast(1.24) brightness(1.04) saturate(0.9)'
 * Saturasi tidak berpengaruh setelah grayscale, jadi hanya kontras+brightness.
 */
function currentProductionFilter(gray) {
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    // brightness dulu, lalu contrast di sekitar titik netral 128.
    const bright = gray[i] * 1.04;
    out[i] = Math.max(0, Math.min(255, (bright - 128) * 1.24 + 128));
  }
  return out;
}

function brightBounds(gray, width, height, { minBright = 120, minRunRatio = 0.06 } = {}) {
  const colHits = new Int32Array(width);
  const rowHits = new Int32Array(height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (gray[y * width + x] >= minBright) { colHits[x] += 1; rowHits[y] += 1; }
    }
  }
  let x0 = 0; let x1 = width - 1; let y0 = 0; let y1 = height - 1;
  const colMin = Math.max(1, Math.floor(height * minRunRatio));
  const rowMin = Math.max(1, Math.floor(width * minRunRatio));
  while (x0 < width && colHits[x0] < colMin) x0 += 1;
  while (x1 > x0 && colHits[x1] < colMin) x1 -= 1;
  while (y0 < height && rowHits[y0] < rowMin) y0 += 1;
  while (y1 > y0 && rowHits[y1] < rowMin) y1 -= 1;
  return { x0, y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

function crop(gray, width, height, box) {
  const w = Math.max(1, box.width); const h = Math.max(1, box.height);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      out[y * w + x] = gray[Math.min(height - 1, box.y0 + y) * width + Math.min(width - 1, box.x0 + x)];
    }
  }
  return { gray: out, width: w, height: h };
}

async function run(worker, label, gray, width, height) {
  const rgba = grayToRgba(gray, width, height);
  const buf = jpeg.encode({ data: rgba, width, height }, 95).data;
  const t0 = Date.now();
  const { data } = await worker.recognize(buf);
  const ms = Date.now() - t0;
  const amount = extract(data.text || '', EXPECTED).amount;
  return { label, amount, ms };
}

async function main() {
  const dir = process.argv[2] || '/tmp/ocrbench2';
  const cases = fs.readFileSync(path.join(dir, 'manifest.txt'), 'utf8').trim().split('\n')
    .map((l) => { const [name, p] = l.split('|'); return { name, path: p }; });

  const worker = await createWorker('eng');
  const scores = {};
  const times = [];
  const rows = [];

  for (const c of cases) {
    const { gray, width, height } = load(c.path);

    // A = pipeline produksi sekarang: filter canvas, tanpa preprocessing.
    const prodFiltered = currentProductionFilter(gray);
    const a = await run(worker, 'A', prodFiltered, width, height);

    // B = hanya auto-crop ke layar HP (tanpa penajaman).
    const box = brightBounds(gray, width, height);
    const cropped = crop(gray, width, height, box);
    const b = await run(worker, 'B', cropped.gray, cropped.width, cropped.height);

    // C = crop + peregangan kontras.
    const c1 = await run(worker, 'C', stretchContrast(cropped.gray), cropped.width, cropped.height);

    // D = crop + kontras + unsharp mask (usulan).
    const sharpened = unsharpMask(stretchContrast(cropped.gray), cropped.width, cropped.height, { radius: 1, amount: 1.1 });
    const d = await run(worker, 'D', sharpened, cropped.width, cropped.height);

    // E = usulan, dijalankan di frame penuh (tanpa crop) untuk melihat peran crop.
    const e = await run(worker, 'E', unsharpMask(stretchContrast(gray), width, height, { radius: 1, amount: 1.1 }), width, height);

    const out = { 'A produksi': a, 'B crop': b, 'C crop+contrast': c1, 'D crop+sharp': d, 'E sharp': e };
    for (const [k, v] of Object.entries(out)) {
      scores[k] = (scores[k] || 0) + (v.amount === EXPECTED ? 1 : 0);
      times.push(v.ms);
    }
    rows.push({ name: c.name, box: `${box.width}x${box.height}`, out });
    console.log(`${c.name.padEnd(14)} ${Object.entries(out).map(([k, v]) => `${k}=${v.amount ?? '-'}`).join('  ')}`);
  }

  const keys = Object.keys(rows[0].out);
  console.log('\n' + 'kondisi        ' + keys.map((k) => k.padEnd(16)).join(''));
  console.log('-'.repeat(15 + keys.length * 16));
  for (const r of rows) {
    console.log(r.name.padEnd(15) + keys.map((k) => String(r.out[k].amount === EXPECTED ? 'OK' : (r.out[k].amount ?? '-')).padEnd(16)).join(''));
  }
  console.log('-'.repeat(15 + keys.length * 16));
  for (const k of keys) console.log(`  ${k.padEnd(18)} ${scores[k]}/${cases.length}`);
  const sorted = [...times].sort((a, b) => a - b);
  console.log(`\nOCR median ${sorted[Math.floor(sorted.length / 2)]} ms, maks ${sorted[sorted.length - 1]} ms`);
  await worker.terminate();
  fs.writeFileSync(path.join(dir, 'decisive.json'), JSON.stringify({ scores, rows }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
