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
console.log('== 4b) kertas label 54 x 67 mm (yang dipakai) ==');
// Kertas label sudah membawa desainnya, jadi frame Admin tidak dipakai.
// Lebarnya melebihi kepala cetak, dan itu WAJAR dicetak terpotong.
const LABEL_W = 54, LABEL_H = 67;
const label = size(LABEL_W, LABEL_H);
assert.ok(label, 'ukuran 54x67 mm harus diterima, bukan ditolak');
assert.strictEqual(label.label_px, px(54), 'lebar yang diminta');
assert.strictEqual(label.label_px, 638, '54 mm = 638 px @300dpi');
assert.strictEqual(label.w_px, PRINTHEAD_PX, 'dikunci ke kepala cetak 576 px');
assert.strictEqual(label.clamped, true, 'harus ditandai dikunci supaya bisa diperingatkan');
const lost = label.label_px - label.w_px;
assert.strictEqual(lost, 62, '62 px hilang');
console.log(`  ok   54 mm = ${label.label_px} px -> ${label.w_px} px tercetak `
  + `(${lost} px = ${mm(lost)} mm terpotong dari sisi kanan)`);
console.log(`  ok   tinggi ${label.h_px} px = ${mm(label.h_px)} mm (batas printer 350 mm, aman)`);

// Rasio kertas vs foto: driver merentang gambar, jadi rasio yang beda = gepeng.
const labAr = label.w_px / label.h_px;
console.log(`  ok   rasio label yang tercetak ${labAr.toFixed(3)} — gambar harus disesuaikan ke rasio ini`);

console.log();
console.log('== 5) halaman memakai angka yang sama dengan perhitungan di atas ==');
// Angka-angka ini harus benar di HTML: kalau salah, label terpotong di printer.
assert.match(PAGE, /var PRINTHEAD_PX = 576;/, 'halaman harus memakai batas kepala cetak 576 px');
assert.match(PAGE, /value="54" min="1" step="0\.5"/, 'bawaan lebar 54 mm (dipakai bila agent tidak jalan)');
assert.match(PAGE, /value="67" min="1" step="0\.5"/, 'bawaan tinggi 67 mm');
assert.match(PAGE, /sizeFromMm\(\{[\s\S]{0,160}dpi: 300, printhead_px: PRINTHEAD_PX/, 
  'ukuran harus dihitung lewat label-size dengan batas kepala cetak');
assert.match(PAGE, /task: 'v4'/, 'B1 Pro memakai print task v4 (bukan b1)');
assert.match(PAGE, /name_prefixes: \['B1'\]/, 'filter pemilih perangkat = awalan nama B1');
assert.match(PAGE, /Niimbot\.printImage\(/, 'memakai API printImage dari driver');
assert.match(PAGE, /clamped/, 'halaman harus memperingatkan kalau ukuran dikunci');
console.log('  ok   batas 576 px, bawaan 54×67 mm, task v4, dan peringatan clamping ada di halaman');

console.log();
console.log('== 5b) penyiapan foto & ukuran kertas label di halaman ==');
// Driver merentang gambar mengisi label (drawImage tanpa jaga rasio), jadi
// halaman harus menyediakan cara mencetak frame tanpa membuatnya gepeng.
assert.match(PAGE, /function renderForPrint\(\)/, 'harus ada penyiapan gambar sebelum cetak');
assert.match(PAGE, /Math\.min\(g\.w_px \/ currentImageSize\.w/, 'skala harus menjaga rasio');
assert.match(PAGE, /id="fit"/, 'harus ada opsi sesuaikan-tanpa-distorsi');
// Pengaturan tidak lagi di halaman ini: nilainya dibaca dari kiosk-agent,
// sumber yang sama dengan photobooth produksi.
assert.match(PAGE, /function applyAdminConfig/, 'halaman harus membaca pengaturan Admin');
assert.match(PAGE, /api\/kiosk-status/, 'dibaca lewat local bridge agent');
assert.ok(!PAGE.includes("id=\"presetLabel\""), 'tombol setel ukuran harus hilang dari halaman uji');
assert.match(PAGE, /id="density"[^>]*readonly/, 'kepekatan tidak boleh disetel di halaman uji');
assert.match(PAGE, /id="offset_y"[^>]*readonly/, 'geser vertikal tidak boleh disetel di halaman uji');
assert.match(PAGE, /renderForPrint\(\)\.then/, 'kedua tombol cetak harus memakai hasil penyiapan');
console.log('  ok   penyiapan gambar menjaga rasio + tombol ukuran kertas 54x67 mm');

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
