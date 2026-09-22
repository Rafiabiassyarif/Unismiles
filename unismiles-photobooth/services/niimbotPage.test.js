// Uji logika halaman uji Niimbot TANPA browser.
//
// Web Bluetooth tidak bisa diuji otomatis (butuh pemilih perangkat + printer
// sungguhan). Yang BISA dan penting diuji otomatis:
//   1. label-size.js menghitung ukuran dengan benar (fungsi murni).
//   2. Halaman memakai angka yang sama dengan yang dihitung itu — kalau halaman
//      mengirim w_px/h_px yang salah, label tercetak terpotong.
//   3. Batas kepala cetak 576 px benar-benar diterapkan sebelum dicetak.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(here, '..', 'public', 'niimbot');
const PAGE = fs.readFileSync(path.join(here, '..', 'public', 'niimbot-test.html'), 'utf8');

// label-size.js menempel ke globalThis (bukan ekspor modul), jadi dibaca lalu
// dijalankan di konteks ini supaya NiimbotLabelSize tersedia.
const labelSizeSrc = fs.readFileSync(path.join(PUB, 'label-size.js'), 'utf8');
new Function(labelSizeSrc)();
const LS = globalThis.NiimbotLabelSize;
assert.ok(LS && typeof LS.sizeFromMm === 'function', 'label-size.js harus mengekspos sizeFromMm');

const DPI = 300;
const PRINTHEAD_PX = 576;   // B1 Pro, dari registry.json (terverifikasi di kertas)

const size = (w_mm, h_mm) => LS.sizeFromMm({ w_mm, h_mm, dpi: DPI, printhead_px: PRINTHEAD_PX });
const px = (mm) => Math.round(mm * DPI / 25.4);
const mm = (p) => +(p * 25.4 / DPI).toFixed(2);

console.log('== 1) geometri 54 × 67 mm (permintaan Nadine) ==');
const s54 = size(54, 67);
assert.strictEqual(s54.label_px, px(54), 'lebar label yang diminta');
assert.strictEqual(s54.label_px, 638, '54 mm = 638 px @300dpi');
assert.strictEqual(s54.w_px, PRINTHEAD_PX, 'dikunci ke kepala cetak');
assert.strictEqual(s54.clamped, true, 'harus ditandai dikunci — jangan menyensor diam-diam');
assert.strictEqual(s54.h_px, px(67), 'tinggi tidak dikunci (printer sanggup 350 mm)');
assert.strictEqual(s54.h_px, 791, '67 mm = 791 px @300dpi');
console.log(`  ok   ${s54.label_px} px diminta → ${s54.w_px} px tercetak (${s54.label_px - s54.w_px} px = ${mm(s54.label_px - s54.w_px)} mm hilang)`);
console.log(`  ok   tinggi ${s54.h_px} px = ${mm(s54.h_px)} mm (batas printer 350 mm, aman)`);

console.log();
console.log('== 2) 48 × 67 mm (yang disarankan, tanpa kehilangan) ==');
const s48 = size(48, 67);
assert.strictEqual(s48.w_px, 567, '48 mm = 567 px');
assert.strictEqual(s48.clamped, false, 'tidak dikunci');
assert.strictEqual(s48.h_px, 791);
console.log(`  ok   ${s48.w_px} × ${s48.h_px} px = ${mm(s48.w_px)} × ${mm(s48.h_px)} mm, tanpa pemotongan`);

console.log();
console.log('== 3) label 50 mm (kertas maksimum menurut spesifikasi) ==');
const s50 = size(50, 67);
assert.strictEqual(s50.w_px, PRINTHEAD_PX, '50 mm = 591 px > 576, jadi dikunci');
assert.strictEqual(s50.clamped, true);
console.log(`  ok   591 px diminta → ${s50.w_px} px tercetak (${mm(591 - s50.w_px)} mm hilang)`);

console.log();
console.log('== 4) batas yang tidak masuk akal ditolak, bukan menghasilkan NaN ==');
assert.strictEqual(size(0, 67), null, 'lebar 0 ditolak');
assert.strictEqual(size(54, -1), null, 'tinggi negatif ditolak');
assert.strictEqual(size(NaN, 67), null, 'NaN ditolak');
assert.strictEqual(LS.sizeFromMm({ w_mm: 54, h_mm: 67, dpi: 300, printhead_px: 0 }), null,
  'printhead 0 ditolak');
console.log('  ok   0 / negatif / NaN / head 0 semuanya mengembalikan null');

console.log();
console.log('== 4b) frame photobooth vs kertas printer ==');
// Angka kanvas frame yang nyata di sistem (dari layout_config frame_templates).
const FRAMES = [
  { name: '1x1', w: 708, h: 1062 },
  { name: '2x1', w: 591, h: 1772 },
  { name: '3x1', w: 591, h: 1772 },
];
for (const f of FRAMES) {
  // Lebar frame melebihi kepala cetak -> harus dipotong, bukan dicetak apa adanya.
  assert.ok(f.w > PRINTHEAD_PX,
    `${f.name}: lebar frame ${f.w} px memang melebihi kepala cetak ${PRINTHEAD_PX} px`);
  // Label yang rasionya sama dengan frame tidak membuat gambar gepeng.
  const w_mm = PRINTHEAD_PX * 25.4 / DPI;
  const h_mm = w_mm * (f.h / f.w);
  assert.ok(h_mm <= 350, `${f.name}: tinggi label ${h_mm.toFixed(1)} mm harus di bawah batas 350 mm`);
  assert.ok(Math.abs((w_mm / h_mm) - (f.w / f.h)) < 0.001,
    `${f.name}: rasio label harus sama dengan rasio frame supaya tidak gepeng`);
  console.log(`  ok   ${f.name}: lebar ${f.w} px -> dikunci ${PRINTHEAD_PX} px `
    + `(terpotong ${((f.w - PRINTHEAD_PX) * 25.4 / DPI).toFixed(1)} mm); `
    + `label ${w_mm.toFixed(0)}×${h_mm.toFixed(0)} mm menjaga rasio`);
}

console.log();
console.log('== 5) halaman memakai angka yang sama dengan perhitungan di atas ==');
// Angka-angka ini harus benar di HTML: kalau salah, label terpotong di printer.
assert.match(PAGE, /var PRINTHEAD_PX = 576;/, 'halaman harus memakai batas kepala cetak 576 px');
assert.match(PAGE, /value="48" min="1" step="0\.5"/, 'bawaan lebar 48 mm (bukan 54)');
assert.match(PAGE, /value="67" min="1" step="0\.5"/, 'bawaan tinggi 67 mm');
assert.match(PAGE, /sizeFromMm\(\{[\s\S]{0,160}dpi: 300, printhead_px: PRINTHEAD_PX/, 
  'ukuran harus dihitung lewat label-size dengan batas kepala cetak');
assert.match(PAGE, /task: 'v4'/, 'B1 Pro memakai print task v4 (bukan b1)');
assert.match(PAGE, /name_prefixes: \['B1'\]/, 'filter pemilih perangkat = awalan nama B1');
assert.match(PAGE, /Niimbot\.printImage\(/, 'memakai API printImage dari driver');
assert.match(PAGE, /clamped/, 'halaman harus memperingatkan kalau ukuran dikunci');
console.log('  ok   batas 576 px, bawaan 48×67 mm, task v4, dan peringatan clamping ada di halaman');

console.log();
console.log('== 5b) penanganan frame vs label di halaman ==');
// Driver merentang gambar mengisi label (drawImage tanpa jaga rasio), jadi
// halaman harus menyediakan cara mencetak frame tanpa membuatnya gepeng.
assert.match(PAGE, /function renderForPrint\(\)/, 'harus ada penyiapan gambar sebelum cetak');
assert.match(PAGE, /Math\.min\(g\.w_px \/ currentImageSize\.w/, 'skala harus menjaga rasio');
assert.match(PAGE, /id="fit"/, 'harus ada opsi sesuaikan-tanpa-distorsi');
assert.match(PAGE, /FRAMES = \[/, 'harus ada preset ukuran per frame');
assert.match(PAGE, /renderForPrint\(\)\.then/, 'kedua tombol cetak harus memakai hasil penyiapan');
console.log('  ok   penyiapan gambar menjaga rasio, opsi fit, dan preset frame ada');

console.log();
console.log('== 6) skrip driver ada dan bisa dimuat ==');
for (const f of ['niimbot.js', 'label-size.js', 'registry.json']) {
  const p = path.join(PUB, f);
  assert.ok(fs.existsSync(p), `${f} harus ada`);
  assert.ok(fs.statSync(p).size > 1000, `${f} tidak boleh kosong`);
}
const reg = JSON.parse(fs.readFileSync(path.join(PUB, 'registry.json'), 'utf8'));
assert.strictEqual(reg.models.b1pro.dpi, 300, 'registry: B1 Pro 300 dpi');
assert.strictEqual(reg.models.b1pro.task, 'v4', 'registry: B1 Pro task v4');
assert.strictEqual(reg.models.b1pro.id, 4097, 'registry: id model B1 Pro');
console.log('  ok   3 berkas ada; registry menyebut B1 Pro 300 dpi / v4 / id 4097');

console.log();
console.log('semua lolos');
