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
import { labelSize, mmToPx, labelMmFromPaperSize, drawRect, printBox, firstSlot, DEFAULT_LABEL_MM, B1_PRO_PRINTHEAD_PX, LABEL_DPI } from './labelGeometry.ts';

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

// --- Kanvas = ukuran KERTAS, bukan dipangkas ke kepala cetak ---
//
// Perilaku lama memangkas lebar ke 576 px dan ikut mengecilkan tinggi. Itu
// membuat skala gambar bukan lagi 300 dpi (~271 dpi), sehingga "margin 3 mm"
// tidak lagi 3 mm di kertas — seluruh kalibrasi meleset. Sekarang kanvas sama
// dengan ukuran kertas, dan yang membatasi tinta adalah kotak cetak.

test('kanvas sama dengan ukuran kertas, tidak dipangkas', () => {
  const s = labelSize(54, 67);
  assert.strictEqual(s.requestedWidthPx, 638, '54 mm = 638 px pada 300 dpi');
  assert.strictEqual(s.widthPx, 638, 'lebar TIDAK dipangkas ke kepala cetak');
  assert.strictEqual(s.heightPx, 791, '67 mm = 791 px pada 300 dpi');
  assert.strictEqual(s.clamped, true, 'tetap ditandai: kertas lebih lebar dari kepala cetak');
  // Skala tetap 300 dpi, jadi milimeter di kertas = milimeter di gambar.
  assert.strictEqual(Math.round(638 / 54), Math.round(791 / 67), 'rasio px per mm sama untuk kedua sisi');
});

test('ukuran kertas yang muat di kepala cetak tidak ditandai terpotong', () => {
  const s = labelSize(45, 61);
  assert.strictEqual(s.widthPx, 531, '45 mm = 531 px');
  assert.strictEqual(s.clamped, false, '48 mm masih di bawah kepala cetak');
});

test('ukuran tidak masuk akal tidak menghasilkan NaN atau 0', () => {
  for (const [w, h] of [[0, 0], [-5, 10], [NaN, 67], [54, NaN]]) {
    const s = labelSize(w, h);
    assert.ok(Number.isFinite(s.widthPx) && s.widthPx >= 1, `lebar sah untuk ${w}x${h}`);
    assert.ok(Number.isFinite(s.heightPx) && s.heightPx >= 1, `tinggi sah untuk ${w}x${h}`);
  }
});

test('kepala cetak bisa dioper untuk unit lain, tanpa mengubah bawaan', () => {
  const lain = labelSize(54, 67, 384);
  assert.strictEqual(lain.widthPx, 638, 'ukuran kanvas tidak bergantung kepala cetak');
  assert.strictEqual(B1_PRO_PRINTHEAD_PX, 576, 'bawaan tidak boleh ikut berubah');
});

test('ukuran label dari pengaturan Admin: format kustom', () => {
  assert.deepEqual(labelMmFromPaperSize('CUSTOM 54X67 MM'), { widthMm: 54, heightMm: 67 });
  assert.deepEqual(labelMmFromPaperSize('custom 54x67mm'), { widthMm: 54, heightMm: 67 });
  assert.deepEqual(labelMmFromPaperSize('CUSTOM 48 X 150 MM'), { widthMm: 48, heightMm: 150 });
  assert.deepEqual(labelMmFromPaperSize('CUSTOM 40×60 MM'), { widthMm: 40, heightMm: 60 });
});

test('ukuran label jatuh ke 54x67 mm untuk nilai yang tidak bisa dibaca', () => {
  for (const v of [null, undefined, '', '4R', 'CUSTOM 0X0 MM', 'garbage']) {
    assert.deepEqual(labelMmFromPaperSize(v as any), { widthMm: 54, heightMm: 67 },
      `nilai ${JSON.stringify(v)} harus jatuh ke bawaan`);
  }
});

test('bawaan konsisten dengan kertas label yang dipakai', () => {
  assert.deepEqual(DEFAULT_LABEL_MM, { widthMm: 54, heightMm: 67 });
});

// --- Mode penyesuaian: acuan sekarang KOTAK CETAK, bukan seluruh kanvas ---

test('mode cover: kotak terisi penuh, tidak ada bingkai', () => {
  const r = drawRect('cover', 576, 541, 628, 782, 0, 0);
  assert.ok(r.dw >= 576 && r.dh >= 541, 'gambar menutupi seluruh kotak');
});

test('mode cover menjaga rasio foto, jadi tidak gepeng', () => {
  const r = drawRect('cover', 576, 541, 628, 782, 0, 0);
  const rasio = r.dw / r.dh;
  assert.ok(Math.abs(rasio - 628 / 782) < 0.02, `rasio dipertahankan (${rasio.toFixed(3)})`);
});

test('mode fit: seluruh foto masuk, sisa kotak dibiarkan kosong', () => {
  const r = drawRect('fit', 576, 541, 628, 782, 0, 0);
  assert.ok(r.dw <= 576 && r.dh <= 541, 'foto muat di dalam kotak');
  assert.strictEqual(Math.round(r.dw / r.dh * 100), Math.round(628 / 782 * 100), 'rasio tetap');
});

test('mode stretch: mengisi kotak dengan merusak rasio', () => {
  const r = drawRect('stretch', 576, 541, 628, 782, 0, 0);
  assert.strictEqual(r.dw, 576);
  assert.strictEqual(r.dh, 541);
});

test('mode cover: sisi yang ketat menempel, bukan ada celah', () => {
  const r = drawRect('cover', 576, 541, 628, 782, 0, 0);
  assert.ok(r.dw >= 576 && r.dh >= 541, 'tidak ada celah di sisi mana pun');
});

test('geser vertikal dari Admin tetap dihormati di ketiga mode', () => {
  for (const mode of ['fit', 'cover', 'stretch'] as const) {
    const nol = drawRect(mode, 576, 541, 628, 782, 0, 0);
    const maju = drawRect(mode, 576, 541, 628, 782, 12, 0);
    assert.strictEqual(maju.dy - nol.dy, 12, `${mode}: geser vertikal 12 px`);
  }
});

test('ukuran gambar rusak tidak menghasilkan NaN', () => {
  const r = drawRect('cover', 576, 541, 0, 0, 0, 0);
  assert.ok(Number.isFinite(r.dx) && Number.isFinite(r.dy) && Number.isFinite(r.dw) && Number.isFinite(r.dh));
});

test('area cetak memakai ukuran slot, bukan seluruh kanvas layout', () => {
  const slot = firstSlot([{ x: 0, y: 0, width: 628, height: 782 }]);
  assert.strictEqual(slot?.width, 628);
  assert.strictEqual(slot?.height, 782);
});

test('slot rusak tidak menghasilkan area cetak', () => {
  assert.strictEqual(firstSlot([]), null);
  assert.strictEqual(firstSlot(null as any), null);
});

test('ukuran slot dibulatkan ke piksel utuh', () => {
  const slot = firstSlot([{ x: 0, y: 0, width: 628.6, height: 782.4 }]);
  assert.ok(Number.isInteger(slot?.width) && Number.isInteger(slot?.height));
});

test('geser mendatar memindahkan gambar tanpa mengubah ukurannya', () => {
  const nol = drawRect('cover', 576, 720, 1600, 1200, 0, 0);
  const kanan = drawRect('cover', 576, 720, 1600, 1200, 0, 24);
  const kiri = drawRect('cover', 576, 720, 1600, 1200, 0, -24);
  assert.strictEqual(kanan.dw, nol.dw, 'lebar tidak berubah');
  assert.strictEqual(kanan.dh, nol.dh, 'tinggi tidak berubah');
  assert.strictEqual(kanan.dx - nol.dx, 24, 'positif menggeser ke kanan');
  assert.strictEqual(kiri.dx - nol.dx, -24, 'negatif menggeser ke kiri');
  assert.strictEqual(kanan.dy, nol.dy, 'geser mendatar tidak mengubah posisi vertikal');
});

test('geser mendatar dan vertikal berdiri sendiri-sendiri', () => {
  const a = drawRect('cover', 576, 720, 1600, 1200, 10, 20);
  const b = drawRect('cover', 576, 720, 1600, 1200, -30, -40);
  assert.strictEqual(a.dx - b.dx, 60, 'selisih mendatar = 20 - (-40)');
  assert.strictEqual(a.dy - b.dy, 40, 'selisih vertikal = 10 - (-30)');
});

test('geser mendatar juga berlaku pada mode stretch', () => {
  const nol = drawRect('stretch', 576, 720, 1600, 1200, 0, 0);
  const geser = drawRect('stretch', 576, 720, 1600, 1200, 7, -13);
  assert.strictEqual(geser.dx - nol.dx, -13, 'stretch: mendatar ikut bergeser');
  assert.strictEqual(geser.dy - nol.dy, 7, 'stretch: vertikal ikut bergeser');
});

// --- Kotak cetak dari margin empat sisi (template label Polaroid) ---
//
// Label NIIMBOT Polaroid 54 x 67 mm sudah punya bingkai tercetak; hanya kotak di
// tengahnya boleh diisi. Marginnya: atas 6 mm, kanan 3 mm, kiri 3 mm, bawah 15 mm.
// Angka bawah 15, bukan 14, supaya kotaknya persis 46 mm — 6 + 46 + 14 = 66,
// sedangkan kertasnya 67 mm, jadi ada 1 mm yang harus jatuh ke suatu sisi.
const POLAROID = { W: 638, H: 792, top: 71, right: 35, left: 35, bottom: 177 };

test('printBox menempatkan area cetak sesuai margin empat sisi', () => {
  const b = printBox(POLAROID.W, POLAROID.H, POLAROID.top, POLAROID.right, POLAROID.left, POLAROID.bottom);
  assert.strictEqual(b.x, 35, 'kiri 35 px');
  assert.strictEqual(b.y, 71, 'atas 71 px');
  assert.strictEqual(b.w, 638 - 35 - 35, 'lebar = kanvas - kiri - kanan');
  assert.strictEqual(b.h, 792 - 71 - 177, 'tinggi = kanvas - atas - bawah');
  // 568 x 544 px = 48,1 x 46,1 mm pada 300 dpi.
  assert.strictEqual(mmToPx(48), 567, '48 mm = 567 px pada 300 dpi');
});

test('kotak cetak tidak pernah negatif walau margin melebihi kanvas', () => {
  const b = printBox(576, 541, 9999, 9999, 9999, 9999);
  assert.ok(b.w >= 0 && b.h >= 0, 'lebar dan tinggi tidak negatif');
});

test('foto ditempatkan DI DALAM kotak, bukan di seluruh kanvas', () => {
  const { W, H, top, right, left, bottom } = POLAROID;
  const box = printBox(W, H, top, right, left, bottom);
  const r = drawRect('cover', W, H, 628, 782, 0, 0, top, right, left, bottom);

  // Tidak ada piksel gambar yang jatuh di luar kotak: itu inti permintaannya.
  assert.ok(r.dx <= box.x + 1, 'tepi kiri gambar tidak melewati kotak (toleransi pembulatan)');
  assert.ok(r.dy <= box.y + 1, 'tepi atas gambar tidak melewati kotak');
  assert.ok(r.dx + r.dw >= box.x + box.w - 1, 'sisi kanan kotak terisi');
  assert.ok(r.dy + r.dh >= box.y + box.h - 1, 'sisi bawah kotak terisi');

  // Bidang cetak tidak lebih besar dari kotak.
  assert.strictEqual(r.clipX, box.x);
  assert.strictEqual(r.clipY, box.y);
  assert.strictEqual(r.clipW, box.w);
  assert.strictEqual(r.clipH, box.h);
});

test('tanpa margin, perilaku lama tidak berubah', () => {
  const W = 576, H = 541, IW = 1600, IH = 1200;
  const nol = drawRect('cover', W, H, IW, IH, 0, 0, 0, 0, 0, 0);
  assert.strictEqual(nol.clipX, 0, 'mulai dari tepi kiri');
  assert.strictEqual(nol.clipY, 0, 'mulai dari tepi atas');
  assert.strictEqual(nol.clipW, W, 'seluruh lebar');
  assert.strictEqual(nol.clipH, H, 'seluruh tinggi');
  // Masih dipusatkan di kanvas seperti sebelumnya.
  assert.strictEqual(nol.dx, Math.round((W - nol.dw) / 2), 'terpusat mendatar');
});

test('offset masih bekerja DI DALAM kotak', () => {
  const { W, H, top, right, left, bottom } = POLAROID;
  const a = drawRect('cover', W, H, 628, 782, 0, 0, top, right, left, bottom);
  const geser = drawRect('cover', W, H, 628, 782, 0, 10, top, right, left, bottom);
  assert.strictEqual(geser.dx - a.dx, 10, 'geser mendatar 10 px');
  // Dan kotak cetaknya tidak ikut bergeser — margin yang menentukan, bukan offset.
  assert.strictEqual(geser.clipX, a.clipX, 'bidang cetak tidak ikut geser');
});

test('mode stretch juga memakai kotak, bukan seluruh kanvas', () => {
  const { W, H, top, right, left, bottom } = POLAROID;
  const box = printBox(W, H, top, right, left, bottom);
  const r = drawRect('stretch', W, H, 628, 782, 0, 0, top, right, left, bottom);
  assert.strictEqual(r.dw, box.w, 'stretch memenuhi lebar KOTAK');
  assert.strictEqual(r.dh, box.h, 'stretch memenuhi tinggi KOTAK');
  assert.strictEqual(r.dx, box.x, 'mulai di tepi kotak');
  assert.strictEqual(r.dy, box.y, 'mulai di tepi atas kotak');
});

test('nama preset label diterjemahkan jadi ukuran kertas', () => {
  assert.deepEqual(labelMmFromPaperSize('nimbotpaper-polaroid'), { widthMm: 54, heightMm: 67 });
  assert.deepEqual(labelMmFromPaperSize('NIMBOTPAPER-POLAROID'), { widthMm: 54, heightMm: 67 });
  // Nama tak dikenal tetap jatuh ke ukuran kustom/bawaan, bukan gagal.
  assert.deepEqual(labelMmFromPaperSize('CUSTOM 48X61 MM'), { widthMm: 48, heightMm: 61 });
});
