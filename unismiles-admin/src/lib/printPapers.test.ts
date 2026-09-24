import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAPER_CATALOG, MEASURED_FRAME, PRINTHEAD_PX, DPI, effectiveSourceDpi,
  mmToPx, pxToMm, printBox, drawRect, previewPlan, effectiveMargin,
  renderPrintBitmap, findPaper, paperMm, isFramed, inkSummary,
} from './printPapers.ts';

/**
 * Katalog kertas resmi B21 Pro dari niimbots.com. Setiap ukuran yang muncul di
 * halaman itu harus bisa dipilih dari panel, kalau tidak operator akan terjebak
 * dengan ukuran yang tidak dikenal.
 */
const DARI_KATALOG = [
  [54, 67], [54, 74], [54, 80], [54, 84], [50, 80], [50, 30], [51, 51], [38, 70], [40, 30],
];

test('semua ukuran kertas dari katalog NIIMBOT bisa dipilih', () => {
  const punya = new Set(PAPER_CATALOG.map(p => `${p.widthMm}x${p.heightMm}`));
  for (const [w, h] of DARI_KATALOG) {
    assert.ok(punya.has(`${w}x${h}`), `kertas ${w}x${h} mm harus ada di katalog panel`);
  }
  assert.strictEqual(findPaper('nimbotpaper-polaroid')?.widthMm, 54);
  assert.strictEqual(findPaper('CUSTOM 54X74 MM')?.heightMm, 74);
  assert.strictEqual(findPaper('tidak dikenal'), null);
});

test('ukuran kanvas = ukuran kertas pada 300 dpi, tidak dipangkas', () => {
  assert.strictEqual(mmToPx(54), 638);
  assert.strictEqual(mmToPx(67), 791);
  assert.strictEqual(pxToMm(555).toFixed(2), '46.99');
  for (const p of PAPER_CATALOG) {
    const plan = previewPlan(p.value, MEASURED_FRAME);
    assert.strictEqual(plan.canvasW, mmToPx(p.widthMm), `${p.label}: lebar kanvas`);
    assert.strictEqual(plan.canvasH, mmToPx(p.heightMm), `${p.label}: tinggi kanvas`);
  }
});

// --- Test silang terhadap SUMBER, bukan terhadap salinannya sendiri ---
//
// Panel menyalin geometri photobooth. Salinan yang diuji terhadap dirinya sendiri
// akan selalu hijau walau angka aslinya berubah. Karena itu di sini dibaca
// berkas sumbernya, dan angka di preview harus cocok dengannya.

test('kotak cetak Polaroid SNS cocok dengan sumber photobooth dan backend', async () => {
  const { readFileSync } = await import('node:fs');
  const geo = readFileSync('/Users/nadine/Unismiles/unismiles-photobooth/services/labelGeometry.ts', 'utf8');
  const be = readFileSync('/Users/nadine/Unismiles/unismiles-backend/utils/paperSizes.js', 'utf8');

  // 1. Sumbernya sendiri masih memuat angka yang diukur.
  assert.match(geo, /'nimbotpaper-polaroid': \{ topPx: 70, rightPx: 83, leftPx: 0, bottomPx: 154, fitMode: 'cover' \}/,
    'photobooth harus masih mengukur 70/83/0/154');
  assert.match(be, /marginTopMm: 70 \/ \(300 \/ 25\.4\)/, 'backend: atas 70 px');
  assert.match(be, /marginBottomMm: 154 \/ \(300 \/ 25\.4\)/, 'backend: bawah 154 px');

  // 2. Preview memakai angka yang sama, dan angkanya konsisten satu sama lain.
  assert.deepEqual(MEASURED_FRAME, { topPx: 70, rightPx: 83, leftPx: 0, bottomPx: 154 });
  assert.match(geo, new RegExp(`B1_PRO_PRINTHEAD_PX = ${PRINTHEAD_PX}\\b`), 'kepala cetak harus 576');
  assert.match(geo, new RegExp(`LABEL_DPI = ${DPI}\\b`), 'dpi harus 300');

  // 3. Hasilnya kotak 555 x 567 di x=0 y=70 — pas di kertas dan di kepala cetak.
  const plan = previewPlan('nimbotpaper-polaroid', { topPx: 0, rightPx: 0, leftPx: 0, bottomPx: 0 });
  assert.deepEqual(plan.box, { x: 0, y: 70, w: 555, h: 567 });
  assert.strictEqual(plan.box.x + plan.box.w, 555, 'tepi kanan di bawah kepala cetak');
  assert.strictEqual(plan.box.y + plan.box.h + MEASURED_FRAME.bottomPx, plan.canvasH, 'tegak menghabiskan kertas');
  assert.strictEqual(plan.box.x + plan.box.w + MEASURED_FRAME.rightPx, plan.canvasW, 'mendatar menghabiskan kertas');
  assert.strictEqual(plan.marginSource, 'measured');
});

test('margin terukur menang atas apa pun yang diisi di panel', () => {
  for (const isi of [
    { topPx: 0, rightPx: 0, leftPx: 0, bottomPx: 0 },
    { topPx: 300, rightPx: 300, leftPx: 300, bottomPx: 300 },
    { topPx: 35, rightPx: 83, leftPx: 0, bottomPx: 189 },
  ]) {
    const { margin, source } = effectiveMargin('nimbotpaper-polaroid', isi);
    assert.deepEqual(margin, MEASURED_FRAME, `isi ${JSON.stringify(isi)} harus diabaikan`);
    assert.strictEqual(source, 'measured');
  }
});

test('kertas berbingkai lain memberi peringatan kalau marginnya masih 0', () => {
  const plan = previewPlan('CUSTOM 54X74 MM', { topPx: 0, rightPx: 0, leftPx: 0, bottomPx: 0 });
  assert.match(String(plan.warning), /berbingkai/, 'harus ada peringatan, bukan diam-diam salah');
  assert.strictEqual(plan.marginSource, 'configured');
  // Kertas polos tidak butuh margin: tidak boleh diberi peringatan palsu.
  assert.strictEqual(previewPlan('CUSTOM 54X80 MM', { topPx: 0, rightPx: 0, leftPx: 0, bottomPx: 0 }).warning, null);
  assert.strictEqual(isFramed(findPaper('CUSTOM 54X80 MM')), false);
  assert.strictEqual(isFramed(findPaper('CUSTOM 54X74 MM')), true);
});

test('kotak tidak pernah keluar kertas maupun kepala cetak', () => {
  // Offset ekstrem: kotak harus BERHENTI, bukan mengecil (itu bukan kalibrasi).
  const nol = previewPlan('nimbotpaper-polaroid', MEASURED_FRAME, 0, 0);
  for (const [ox, oy] of [[500, 0], [-500, 0], [0, 900], [0, -900]]) {
    const p = previewPlan('nimbotpaper-polaroid', MEASURED_FRAME, ox, oy);
    assert.strictEqual(p.box.w, nol.box.w, `offset ${ox},${oy}: lebar tetap`);
    assert.strictEqual(p.box.h, nol.box.h, `offset ${ox},${oy}: tinggi tetap`);
    assert.ok(p.box.x >= 0 && p.box.x + p.box.w <= PRINTHEAD_PX, `offset ${ox},${oy}: di dalam kepala cetak`);
    assert.ok(p.box.y >= 0 && p.box.y + p.box.h <= p.canvasH, `offset ${ox},${oy}: di dalam kertas`);
  }
  // Margin yang melebihi kertas dijepit, tidak menghasilkan ukuran negatif.
  const b = printBox(638, 791, { topPx: 9999, rightPx: 9999, leftPx: 9999, bottomPx: 9999 });
  assert.ok(b.w >= 0 && b.h >= 0);
});

test('mode cover mengisi kotak penuh tanpa merusak rasio', () => {
  const box = previewPlan('nimbotpaper-polaroid', MEASURED_FRAME).box;
  const r = drawRect('cover', box, 628, 782);
  assert.ok(r.dw >= box.w && r.dh >= box.h, 'tidak ada celah di sisi mana pun');
  assert.ok(Math.abs(r.dw / r.dh - 628 / 782) < 0.05, 'rasio dijaga, tidak gepeng');
  const f = drawRect('fit', box, 628, 782);
  assert.ok(f.dw <= box.w && f.dh <= box.h, 'fit: seluruh foto masuk');
  const s = drawRect('stretch', box, 628, 782);
  assert.deepEqual([s.dw, s.dh], [box.w, box.h], 'stretch: kotak dipenuhi apa adanya');
});

// --- Yang benar-benar dilihat printer: bitmap, bukan angka ---

/** Bitmap + foto sintetis, lalu jalankan jalur cetak produksi. */
function bitmap(paperSize: string, margin: Parameters<typeof printBox>[2], fitMode: 'fit' | 'cover' | 'stretch' = 'cover') {
  const plan = previewPlan(paperSize, margin);
  const data = new Uint8ClampedArray(plan.canvasW * plan.canvasH * 4).fill(255);
  const imgW = 628, imgH = 782;
  // Gradien + blok gelap: kotak jadi berisi tinta, sehingga bbox-nya terukur.
  const sample = (sx: number, sy: number): [number, number, number] => {
    const v = 30 + Math.round(((sx / imgW) * 0.5 + (sy / imgH) * 0.5) * 190);
    return [v, v, v];
  };
  renderPrintBitmap({ data, width: plan.canvasW, height: plan.canvasH }, { plan, fitMode, imgW, imgH, sample });
  let ink = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, liar = 0;
  for (let y = 0; y < plan.canvasH; y += 1) {
    for (let x = 0; x < plan.canvasW; x += 1) {
      if (data[(y * plan.canvasW + x) * 4] === 0) {
        ink += 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        const luar = x < plan.box.x || x >= plan.box.x + plan.box.w || y < plan.box.y || y >= plan.box.y + plan.box.h;
        if (luar) liar += 1;
      }
    }
  }
  return { plan, ink, x0, y0, x1, y1, liar };
}

test('tinta hanya keluar DI DALAM kotak cetak — inilah WYSIWYG-nya', () => {
  const { plan, ink, x0, y0, x1, y1, liar } = bitmap('nimbotpaper-polaroid', MEASURED_FRAME);
  assert.ok(ink > 10000, 'foto harus benar-benar menghasilkan tinta, bukan putih kosong');
  assert.strictEqual(liar, 0, 'tidak boleh ada tinta di luar kotak (menimpa bingkai tercetak)');
  assert.strictEqual(x0, plan.box.x, 'tepi kiri tinta = tepi kotak');
  assert.strictEqual(y0, plan.box.y, 'tepi atas tinta = tepi kotak');
  assert.strictEqual(x1, plan.box.x + plan.box.w - 1, 'tepi kanan tinta = tepi kotak');
  assert.strictEqual(y1, plan.box.y + plan.box.h - 1, 'tepi bawah tinta = tepi kotak');
  // Dan cocok dengan hasil cetak nyata yang sudah diverifikasi di kertas.
  assert.deepEqual([x0, y0, x1, y1], [0, 70, 554, 636]);
});

test('pilihan kertas mengubah preview, dan hasilnya tetap di dalam kertas', () => {
  for (const p of PAPER_CATALOG) {
    const margin = p.value === 'nimbotpaper-polaroid' ? MEASURED_FRAME : { topPx: 40, rightPx: 40, leftPx: 40, bottomPx: 40 };
    const { plan, ink, liar, x1, y1 } = bitmap(p.value, margin, 'cover');
    assert.ok(ink > 0, `${p.label}: harus ada tinta`);
    assert.strictEqual(liar, 0, `${p.label}: tidak ada tinta di luar kotak`);
    assert.ok(x1 < plan.canvasW && y1 < plan.canvasH, `${p.label}: tinta tidak keluar kanvas`);
    assert.ok(plan.box.x + plan.box.w <= PRINTHEAD_PX, `${p.label}: kotak di dalam kepala cetak`);
  }
});

test('satu halaman = satu label: kanvas setinggi satu kertas', () => {
  // Kalau tinggi kanvas lebih dari tinggi kertas, printer akan memajukan kertas
  // melewati satu label — persis yang pernah terjadi.
  for (const p of PAPER_CATALOG) {
    const plan = previewPlan(p.value, MEASURED_FRAME);
    assert.strictEqual(plan.canvasH, mmToPx(p.heightMm), `${p.label}: kanvas = satu label`);
  }
});

// --- 300 dpi: kanvas selalu, sumber belum tentu ---
//
// Dua hal yang sering dicampur. Kanvas 300 dpi itu harga mati (kalibrasi mm
// bergantung padanya). Foto SUNGGUHAN belum tentu punya cukup piksel, dan kalau
// kurang hasilnya tetap "300 dpi" tapi hasil interpolasi — kabur, tanpa pesan
// error. Fungsi ini yang membedakannya.

test('sumber yang cukup piksel dilaporkan >= 300 dpi, tidak diperbesar', () => {
  const box = previewPlan('nimbotpaper-polaroid', MEASURED_FRAME).box;
  // Slot 1x1 di produksi: 628 x 782 px untuk kotak 555 x 567.
  const d = effectiveSourceDpi(box, 628, 782, 'cover');
  assert.strictEqual(d.upscaled, false, '628x782 cukup untuk kotak 555x567');
  assert.ok(d.min >= DPI, `dpi efektif ${d.min.toFixed(0)} harus >= ${DPI}`);
  // Angkanya harus masuk akal: sekitar 338 dpi untuk pasangan ini.
  assert.ok(d.min > 320 && d.min < 360, `diharapkan ~338 dpi, dapat ${d.min.toFixed(0)}`);
});

test('sumber yang kurang piksel DITANDAI, bukan dibiarkan tampak normal', () => {
  const box = previewPlan('nimbotpaper-polaroid', MEASURED_FRAME).box;
  // Foto kecil: pasti diperbesar untuk memenuhi kotak.
  const d = effectiveSourceDpi(box, 200, 250, 'cover');
  assert.strictEqual(d.upscaled, true, '200x250 TIDAK cukup untuk kotak 555x567 — harus ditandai');
  assert.ok(d.min < DPI);
  // Foto 300 dpi PAS: 555 px untuk kotak selebar 555 px.
  const pas = effectiveSourceDpi(box, 555, 567, 'cover');
  assert.ok(Math.abs(pas.min - DPI) < 3, `pas 300 dpi: dapat ${pas.min.toFixed(0)}`);
});

test('ukuran sumber 0 tidak pernah menghasilkan angka palsu', () => {
  const box = previewPlan('nimbotpaper-polaroid', MEASURED_FRAME).box;
  for (const [w, h] of [[0, 100], [100, 0], [0, 0]] as [number, number][]) {
    const d = effectiveSourceDpi(box, w, h, 'cover');
    assert.ok(Number.isFinite(d.min) && d.min >= 0, 'angka harus terhingga');
    assert.strictEqual(d.upscaled, true, 'tanpa gambar, tidak boleh mengaku siap 300 dpi');
  }
});

test('dpi kanvas tidak bergantung pada ukuran foto', () => {
  // Kanvas selalu 300 dpi: 54x67 mm harus 638x791 px apa pun fotonya.
  for (const p of PAPER_CATALOG) {
    const plan = previewPlan(p.value, MEASURED_FRAME);
    assert.strictEqual(plan.canvasW, Math.round((p.widthMm / 25.4) * DPI), `${p.label}: lebar 300 dpi`);
    assert.strictEqual(plan.canvasH, Math.round((p.heightMm / 25.4) * DPI), `${p.label}: tinggi 300 dpi`);
  }
});

test('ringkasan yang ditampilkan ke operator cocok dengan kotaknya', () => {
  const s = inkSummary(previewPlan('nimbotpaper-polaroid', MEASURED_FRAME));
  assert.strictEqual(s.boxLabel, '555 × 567 px di x=0 y=70');
  assert.strictEqual(s.mmLabel, '46.99 × 48.01 mm');
  assert.strictEqual(s.rightEdgePx, 555);
  assert.strictEqual(s.headroomPx, PRINTHEAD_PX - 555, 'sisa ruang ke kepala cetak ditampilkan apa adanya');
});
