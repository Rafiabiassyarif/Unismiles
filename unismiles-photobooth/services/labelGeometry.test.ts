/**
 * Test geometri label — menjalankan perhitungan sungguhan, bukan memeriksa teks.
 *
 * `services/labelGeometry.ts` sengaja bebas dependensi supaya bisa diimpor di
 * sini tanpa Web Bluetooth. Perhitungan lebar adalah penentu utama hasil cetak:
 * salah 9 px berarti tepi label terpotong dan printer tidak memberi error apa
 * pun. Karena itu ia harus benar-benar dieksekusi, bukan sekadar dibaca.
 */

import assert from 'node:assert';
import { test } from 'node:test';
import { labelSize, mmToPx, labelMmFromPaperSize, DEFAULT_LABEL_MM, B1_PRO_PRINTHEAD_PX, LABEL_DPI } from './labelGeometry.ts';

test('konstanta kepala cetak sesuai pengukuran di kertas, bukan tabel library', () => {
  assert.strictEqual(B1_PRO_PRINTHEAD_PX, 576);
  assert.strictEqual(LABEL_DPI, 300);
  // NiimBlueLib menulis 567 untuk B1_PRO. Kalau angka di sini pernah berubah
  // menjadi 567, berarti ada yang menyalin tabel library dan mengabaikan
  // pengukuran di unit yang dipakai.
  assert.notStrictEqual(B1_PRO_PRINTHEAD_PX, 567,
    'jangan pakai 567 dari tabel library — 576 berasal dari pengukuran di kertas');
});

test('konversi mm ke px pada 300 dpi', () => {
  assert.strictEqual(mmToPx(25.4), 300, '1 inci = 300 px');
  assert.strictEqual(mmToPx(54), 638);
  assert.strictEqual(mmToPx(67), 791);
  assert.strictEqual(mmToPx(48), 567);
});

test('kertas 54 x 67 mm: lebar dipotong, tinggi utuh', () => {
  // Inilah kertas yang dipakai. Lebarnya melebihi kepala cetak, dan itu WAJAR —
  // 5,25 mm sisi kanan tidak tercetak.
  const s = labelSize(54, 67);
  assert.strictEqual(s.requestedWidthPx, 638, 'lebar yang diminta');
  assert.strictEqual(s.widthPx, 576, 'dikunci ke kepala cetak');
  assert.strictEqual(s.heightPx, 791, 'tinggi tidak dikunci (printer sanggup 350 mm)');
  assert.strictEqual(s.clamped, true, 'harus ditandai dipotong supaya bisa diperingatkan');

  const lostPx = s.requestedWidthPx - s.widthPx;
  assert.strictEqual(lostPx, 62, '62 px hilang');
  assert.strictEqual(+(lostPx / LABEL_DPI * 25.4).toFixed(2), 5.25, 'yaitu 5,25 mm');
});

test('kertas 48 x 67 mm: tercetak penuh tanpa pemotongan', () => {
  const s = labelSize(48, 67);
  assert.strictEqual(s.widthPx, 567);
  assert.strictEqual(s.clamped, false, 'tidak boleh ditandai dipotong');
  assert.strictEqual(s.heightPx, 791);
});

test('kertas 50 x 67 mm: hanya 1,27 mm hilang', () => {
  const s = labelSize(50, 67);
  assert.strictEqual(s.widthPx, 576);
  assert.strictEqual(s.clamped, true);
  assert.strictEqual(+(s.requestedWidthPx - s.widthPx) / LABEL_DPI * 25.4 < 1.3, true);
});

test('lebar tepat di batas kepala cetak tidak dianggap dipotong', () => {
  // Batas harus inklusif: 48,77 mm = 576 px, dan 576 px memang tercetak semua.
  const s = labelSize(48.77, 67);
  assert.strictEqual(s.widthPx, 576);
  assert.strictEqual(s.clamped, false, 'tepat di batas berarti muat, bukan dipotong');
});

test('ukuran tidak masuk akal tidak menghasilkan NaN atau 0', () => {
  // Nilai rusak dari DB/agent tidak boleh membuat canvas 0 px — canvaskan yang
  // nol akan menggagalkan encodeCanvas dengan pesan yang tidak informatif.
  for (const [w, h] of [[0, 67], [-5, 67], [54, 0], [54, -1], [0, 0]]) {
    const s = labelSize(w, h);
    assert.ok(Number.isFinite(s.widthPx) && s.widthPx >= 1, `lebar ${w} mm -> ${s.widthPx} px`);
    assert.ok(Number.isFinite(s.heightPx) && s.heightPx >= 1, `tinggi ${h} mm -> ${s.heightPx} px`);
  }
});

test('lebar dikunci juga untuk kertas yang jauh lebih lebar', () => {
  // Penjaga: apa pun ukuran kertasnya, gambar tidak pernah lebih lebar dari kepala.
  for (const w of [60, 100, 210]) {
    const s = labelSize(w, 100);
    assert.strictEqual(s.widthPx, B1_PRO_PRINTHEAD_PX, `lebar ${w} mm harus tetap dikunci`);
    assert.strictEqual(s.clamped, true);
  }
});

test('kepala cetak bisa dioper untuk unit lain, tanpa mengubah bawaan', () => {
  // Unit lain (mis. D110, kepala 384 px) memakai fungsi yang sama.
  const s = labelSize(48, 67, 384);
  assert.strictEqual(s.widthPx, 384);
  assert.strictEqual(B1_PRO_PRINTHEAD_PX, 576, 'bawaan tidak boleh ikut berubah');
});

test('ukuran label dari pengaturan Admin: format kustom', () => {
  // Inilah nilai yang tersimpan di produksi.
  assert.deepEqual(labelMmFromPaperSize('CUSTOM 54X67 MM'), { widthMm: 54, heightMm: 67 });
  // Variasi penulisan yang wajar harus diterima juga.
  assert.deepEqual(labelMmFromPaperSize('custom 54x67mm'), { widthMm: 54, heightMm: 67 });
  assert.deepEqual(labelMmFromPaperSize('CUSTOM 48 X 150 MM'), { widthMm: 48, heightMm: 150 });
  assert.deepEqual(labelMmFromPaperSize('CUSTOM 40×60 MM'), { widthMm: 40, heightMm: 60 });
});

test('ukuran label jatuh ke 54x67 mm untuk nilai yang tidak bisa dibaca', () => {
  // Preset bernama ('Instax Mini', '4R') bukan ukuran termal. Memakai bawaan
  // lebih benar daripada menebak dari namanya.
  for (const v of ['Instax Mini (54 × 86 mm)', '4R', '', null, undefined, 'ngawur', 0, 42]) {
    assert.deepEqual(labelMmFromPaperSize(v as any), { widthMm: 54, heightMm: 67 },
      `nilai ${JSON.stringify(v)} harus jatuh ke bawaan`);
  }
});

test('ukuran nol atau rusak tidak menghasilkan canvas 0 px', () => {
  // 'CUSTOM 0X67 MM' akan membuat canvas 0 px dan encodeCanvas gagal dengan
  // pesan yang tidak informatif. Jatuh ke bawaan lebih berguna.
  for (const v of ['CUSTOM 0X67 MM', 'CUSTOM 54X0 MM', 'CUSTOM 0X0 MM']) {
    const mm = labelMmFromPaperSize(v);
    assert.ok(mm.widthMm > 0 && mm.heightMm > 0, `${v} harus jatuh ke bawaan, dapat ${JSON.stringify(mm)}`);
    const size = labelSize(mm.widthMm, mm.heightMm);
    assert.ok(size.widthPx >= 1 && size.heightPx >= 1, `${v} harus menghasilkan ukuran px yang sah`);
  }
});

test('bawaan konsisten dengan kertas label yang dipakai', () => {
  assert.deepEqual(DEFAULT_LABEL_MM, { widthMm: 54, heightMm: 67 });
  const size = labelSize(DEFAULT_LABEL_MM.widthMm, DEFAULT_LABEL_MM.heightMm);
  assert.strictEqual(size.widthPx, 576, 'lebar dikunci ke kepala cetak');
  assert.strictEqual(size.clamped, true, 'harus jujur bahwa ada yang terpotong');
});
