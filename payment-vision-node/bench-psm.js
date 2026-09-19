/**
 * bench-psm.js — uji mode segmentasi Tesseract + multi-skala.
 *
 * Dua hal yang belum pernah diuji dan keduanya relevan dengan keluhan nyata:
 *  1. PSM (page segmentation mode). Default Tesseract (3) menganggap gambar
 *     sebagai halaman penuh dengan banyak kolom. Struk di layar HP jauh lebih
 *     cocok dengan mode 6 (blok teks seragam) atau 11 (teks jarang).
 *  2. Tinggi huruf. Pada kiosk, jarak HP ke kamera berubah-ubah, jadi tinggi
 *     glyph bisa jauh di luar rentang nyaman Tesseract. Multi-skala mengatasi
 *     ini tanpa perlu tahu jaraknya.
 *
 * Jalankan: node bench-psm.js /tmp/ocrbench2
 */
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { createWorker } = require('tesseract.js');
const { extract } = require('./ocr');
const { toGrayscale, stretchContrast, unsharpMask, autoCrop, grayToRgba, scaleGray } = require('./preprocess');

const EXPECTED = 5092;

function load(file) {
  const d = jpeg.decode(fs.readFileSync(file), { useTArray: true });
  return { data: Buffer.from(d.data), width: d.width, height: d.height };
}

async function ocr(worker, gray, width, height, psm) {
  const rgba = grayToRgba(gray, width, height);
  const buf = jpeg.encode({ data: rgba, width, height }, 95).data;
  await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
  const { data } = await worker.recognize(buf);
  return { text: data.text || '', amount: extract(data.text || '', EXPECTED).amount };
}

async function main() {
  const dir = process.argv[2] || '/tmp/ocrbench2';
  const manifest = fs.readFileSync(path.join(dir, 'manifest.txt'), 'utf8').trim().split('\n')
    .map((l) => { const [name, p] = l.split('|'); return { name, path: p }; });

  const worker = await createWorker('eng');
  const PSMS = [3, 6, 11];
  const SCALES = [1, 1.6];
  const scores = {};
  const rows = [];

  for (const c of manifest) {
    const { data, width, height } = load(c.path);
    const cropped = autoCrop(toGrayscale(data, width, height), width, height);
    const sharp = unsharpMask(stretchContrast(cropped.gray), cropped.width, cropped.height, { radius: 1, amount: 1.1 });

    const out = {};
    for (const scale of SCALES) {
      const v = scaleGray(sharp, cropped.width, cropped.height, scale);
      for (const psm of PSMS) {
        const key = `psm${psm}${scale > 1 ? ' x' + scale : ''}`;
        const r = await ocr(worker, v.gray, v.width, v.height, psm);
        out[key] = r.amount;
        scores[key] = (scores[key] || 0) + (r.amount === EXPECTED ? 1 : 0);
      }
    }
    rows.push({ name: c.name, out });
    console.log(`${c.name.padEnd(15)} ${Object.entries(out).map(([k, v]) => `${k}=${v === EXPECTED ? 'OK' : (v ?? '-')}`).join('  ')}`);
  }

  console.log('\n' + 'kondisi'.padEnd(15) + Object.keys(rows[0].out).map((k) => k.padEnd(12)).join(''));
  console.log('-'.repeat(15 + Object.keys(rows[0].out).length * 12));
  for (const r of rows) {
    console.log(r.name.padEnd(15) + Object.keys(r.out).map((k) => String(r.out[k] === EXPECTED ? 'OK' : (r.out[k] ?? '-')).padEnd(12)).join(''));
  }
  console.log('-'.repeat(15 + Object.keys(rows[0].out).length * 12));
  for (const k of Object.keys(scores)) console.log(`  ${k.padEnd(14)} ${scores[k]}/${manifest.length}`);

  await worker.terminate();
  fs.writeFileSync(path.join(dir, 'psm.json'), JSON.stringify({ scores, rows }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
