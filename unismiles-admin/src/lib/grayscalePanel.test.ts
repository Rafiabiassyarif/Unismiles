import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  grayscaleValue, sharpenGray, boxBlurGray, GRAYSCALE_OPTIONS,
  renderPrintBitmap, previewPlan, MEASURED_FRAME,
  type GrayscaleAlgorithm,
} from './printPapers.ts';

/**
 * Panel Admin menyalin mesin abu-abu + penajaman dari produksi. Salinan yang
 * diuji terhadap dirinya sendiri akan selalu hijau walau aslinya berubah —
 * karena itu di bawah ini berkas SUMBERNYA dibaca langsung.
 */

const SUMBER = '/Users/nadine/Unismiles/unismiles-photobooth/services/oneBitImage.ts';
const PRINTER = '/Users/nadine/Unismiles/unismiles-photobooth/services/niimbotPrinter.ts';
const BACKEND = '/Users/nadine/Unismiles/unismiles-backend/utils/printingConfigValidation.js';

test('daftar algoritma panel = daftar di produksi = daftar di backend', () => {
  const prod = readFileSync(SUMBER, 'utf8');
  const be = readFileSync(BACKEND, 'utf8');

  for (const o of GRAYSCALE_OPTIONS) {
    assert.match(prod, new RegExp(`case '${o.value}':`),
      `produksi tidak mengenal algoritma '${o.value}'`);
  }
  const blok = be.match(/const GRAYSCALE_ALGORITHMS = \[([\s\S]*?)\];/);
  assert.ok(blok, 'backend harus punya daftar GRAYSCALE_ALGORITHMS');
  for (const o of GRAYSCALE_OPTIONS) {
    assert.ok(blok![1].includes(`'${o.value}'`),
      `backend tidak mengenal '${o.value}' — panel bisa menyimpan nilai yang ditolak API`);
  }
  // Jumlah kutip dua kali jumlah nilai harus sama: tidak ada nilai yang hanya
  // ada di satu sisi.
  const jumlahBackend = (blok![1].match(/'/g) || []).length / 2;
  assert.strictEqual(jumlahBackend, GRAYSCALE_OPTIONS.length,
    'jumlah algoritma di backend harus sama dengan di panel');
});

test('bobot di panel identik dengan bobot di produksi', () => {
  const prod = readFileSync(SUMBER, 'utf8');
  for (const potongan of [
    '0.299 * r + 0.587 * g + 0.114 * b',
    '0.2126 * r + 0.7152 * g + 0.0722 * b',
    '0.299 * rn * rn + 0.587 * gn * gn + 0.114 * bn * bn',
  ]) {
    assert.ok(prod.includes(potongan), `produksi harus memakai bobot: ${potongan}`);
  }
  assert.ok(Math.abs(grayscaleValue('rec601', 200, 100, 50) - (0.299 * 200 + 0.587 * 100 + 0.114 * 50)) < 0.001);
  assert.ok(Math.abs(grayscaleValue('rec709', 200, 100, 50) - (0.2126 * 200 + 0.7152 * 100 + 0.0722 * 50)) < 0.001);
});

test('penajaman panel memakai radius, ambang, dan skala yang sama dengan produksi', () => {
  const prod = readFileSync(SUMBER, 'utf8');
  assert.match(prod, /radius = 2/, 'produksi harus menajamkan dengan radius 2');
  assert.match(prod, /threshold = 2/, 'produksi harus memakai ambang 2');
  // Pembagian 50 = skala UI 0..100 -> penajaman 0..2. Kalau salah satu sisi
  // berbeda, angka yang sama di panel memberi hasil berbeda di kertas.
  assert.match(readFileSync(PRINTER, 'utf8'), /Number\(adj\.sharpen\) \|\| 0\)\) \/ 50/,
    'produksi harus membagi 50, bukan 100');
});

/** Hitung tinta + bbox untuk satu bitmap kanvas. */
function hitung(data: Uint8ClampedArray, w: number, h: number) {
  let tinta = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4] !== 0) continue;
      tinta += 1;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { tinta, x0, y0, x1, y1 };
}

/** Foto uji berwarna dengan tekstur halus, seperti foto sungguhan. */
function sampleWarna(sx: number, sy: number): [number, number, number] {
  const garis = (sx % 6) < 2 ? -25 : 0;
  const v = Math.round(150 + sy * 0.1 + garis);
  const kolom = Math.floor(sx / 30) % 3;
  const dasar = [[190, 45, 45], [45, 170, 60], [50, 70, 200]][kolom];
  return [
    Math.max(0, Math.min(255, dasar[0] + v - 160)),
    Math.max(0, Math.min(255, dasar[1] + v - 160)),
    Math.max(0, Math.min(255, dasar[2] + v - 160)),
  ];
}

function cetak(alg: GrayscaleAlgorithm, tajam: number) {
  const plan = previewPlan('nimbotpaper-polaroid', MEASURED_FRAME);
  const data = new Uint8ClampedArray(plan.canvasW * plan.canvasH * 4).fill(255);
  // Lewat jalur produksi (klip ke kotak -> gambar foto -> dither), bukan
  // dither atas kanvas kosong: kanvas kosong memang tidak menghasilkan tinta,
  // dan menguji itu tidak membuktikan apa pun.
  const imgW = 300, imgH = 300;
  renderPrintBitmap(
    { data, width: plan.canvasW, height: plan.canvasH },
    { plan, fitMode: 'cover', imgW, imgH, sample: sampleWarna, grayscale: alg, sharpen: tajam },
  );
  return { plan, data, ...hitung(data, plan.canvasW, plan.canvasH) };
}

test('penajaman mengubah bitmap preview — bukan diterima lalu diabaikan', () => {
  const tanpa = cetak('rec601', 0);
  const kuat = cetak('rec601', 100);
  assert.ok(tanpa.tinta > 0, 'harus ada tinta untuk dibandingkan');
  assert.ok(kuat.tinta > 0, 'harus ada tinta untuk dibandingkan');
  // Kalau bitmapnya persis sama, penajaman tidak berpengaruh di preview —
  // persis kesalahan yang pernah terjadi pada brightness/contrast di panel ini.
  assert.notStrictEqual(kuat.tinta, tanpa.tinta,
    'penajaman 100% harus mengubah hasil di preview');
});

test('tinta tetap hanya di dalam kotak, di semua algoritma dan penajaman', () => {
  for (const o of GRAYSCALE_OPTIONS) {
    for (const tajam of [0, 100]) {
      const h = cetak(o.value, tajam);
      assert.ok(h.tinta > 0, `${o.value}/${tajam}: harus ada tinta`);
      assert.strictEqual(h.x0, h.plan.box.x, `${o.value}/${tajam}: tepi kiri tinta = tepi kotak`);
      assert.strictEqual(h.y0, h.plan.box.y, `${o.value}/${tajam}: tepi atas tinta = tepi kotak`);
      assert.ok(h.x1 <= h.plan.box.x + h.plan.box.w - 1, `${o.value}/${tajam}: tidak melewati kanan kotak`);
      assert.ok(h.y1 <= h.plan.box.y + h.plan.box.h - 1, `${o.value}/${tajam}: tidak melewati bawah kotak`);
    }
  }
});

test('setiap algoritma memberi bitmap berbeda pada foto berwarna', () => {
  const tanda = new Map<string, number>();
  for (const o of GRAYSCALE_OPTIONS) tanda.set(o.value, cetak(o.value, 0).tinta);
  const nilai = [...tanda.entries()];
  // Minimal 6 dari 9 harus berbeda. Tidak menuntut 9/9 karena ada algoritma yang
  // bisa kebetulan menghasilkan jumlah tinta sama pada foto tertentu; yang
  // penting adalah mereka TIDAK semuanya identik (kalau begitu, pilihannya
  // kosong secara fungsional).
  const berbeda = new Set(nilai.map(([, n]) => n)).size;
  assert.ok(berbeda >= 6, `hanya ${berbeda} dari ${nilai.length} algoritma yang berbeda hasilnya: ${nilai.map(([k, n]) => `${k}=${n}`).join(', ')}`);
});

test('boxBlurGray & sharpenGray panel berperilaku sama dengan produksi', () => {
  const rata = new Float32Array(50 * 50).fill(140);
  const hasil = boxBlurGray(rata, 50, 50, 2);
  for (const p of [0, 49, 49 * 50, 50 * 50 - 1]) {
    assert.ok(Math.abs(hasil[p] - 140) < 0.001, 'tepi gambar tidak boleh dianggap gelap');
  }
  const rata2 = new Float32Array(50 * 50).fill(140);
  sharpenGray(rata2, 50, 50, 2);
  assert.deepEqual(Array.from(rata2), Array.from(new Float32Array(50 * 50).fill(140)),
    'area rata tidak boleh berubah');
  const ekstrem = new Float32Array(50 * 50);
  for (let i = 0; i < ekstrem.length; i += 1) ekstrem[i] = i % 2 ? 255 : 0;
  sharpenGray(ekstrem, 50, 50, 2);
  for (const v of ekstrem) assert.ok(v >= 0 && v <= 255, `nilai ${v} di luar 0..255`);
  // Panjang array 0 dan radius 0 tidak boleh meledak.
  boxBlurGray(new Float32Array(0), 0, 0, 2);
  assert.deepEqual(Array.from(boxBlurGray(new Float32Array([1, 2, 3, 4]), 2, 2, 0)), [1, 2, 3, 4]);
});
