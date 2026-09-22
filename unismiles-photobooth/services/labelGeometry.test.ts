import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelSize, mmToPx, labelMmFromPaperSize, drawRect, printBox, firstSlot, DEFAULT_LABEL_MM, B1_PRO_PRINTHEAD_PX, LABEL_DPI } from './labelGeometry.ts';

// --- Kalibrasi: menggeser KOTAK, tidak mengubah ukuran ---
//
// Rentangnya terbatas secara fisik: area 46 mm memakai 543 px dari 576 px yang
// bisa dicetak, jadi hanya ada 33 px (2,79 mm) ruang geser mendatar. Vertical
// longgar. Itu batas printer, bukan batasan perangkat lunak.

const POL = { W: 638, H: 791, top: 71, right: 78, left: 17, bottom: 177 };

test('kalibrasi menggeser kotak tanpa mengubah ukuran area', () => {
  const { W, H, top, right, left, bottom } = POL;
  const nol = drawRect('cover', W, H, 628, 782, 0, 0, top, right, left, bottom);
  const kanan = drawRect('cover', W, H, 628, 782, 0, 10, top, right, left, bottom);
  const kiri = drawRect('cover', W, H, 628, 782, 0, -10, top, right, left, bottom);

  assert.strictEqual(kanan.clipX - nol.clipX, 10, 'positif menggeser kotak ke kanan');
  assert.strictEqual(kiri.clipX - nol.clipX, -10, 'negatif menggeser kotak ke kiri');
  // Yang TIDAK boleh berubah: ukuran area dan ukuran foto.
  assert.strictEqual(kanan.clipW, nol.clipW, 'lebar area tidak berubah');
  assert.strictEqual(kanan.clipH, nol.clipH, 'tinggi area tidak berubah');
  assert.strictEqual(kanan.dw, nol.dw, 'lebar foto tidak berubah (tidak ada scaling)');
  assert.strictEqual(kanan.dh, nol.dh, 'tinggi foto tidak berubah (tidak ada scaling)');
  // Sumbu lain tidak ikut.
  assert.strictEqual(kanan.clipY, nol.clipY, 'kalibrasi X tidak menggeser Y');
});

test('kalibrasi dua sumbu berdiri sendiri-sendiri', () => {
  const { W, H, top, right, left, bottom } = POL;
  const a = drawRect('cover', W, H, 628, 782, 20, 10, top, right, left, bottom);
  const b = drawRect('cover', W, H, 628, 782, -30, -10, top, right, left, bottom);
  assert.strictEqual(a.clipX - b.clipX, 20, 'selisih mendatar = 10 - (-10)');
  assert.strictEqual(a.clipY - b.clipY, 50, 'selisih vertikal = 20 - (-30)');
});

test('kalibrasi juga berlaku pada mode stretch', () => {
  const { W, H, top, right, left, bottom } = POL;
  const nol = drawRect('stretch', W, H, 628, 782, 0, 0, top, right, left, bottom);
  const geser = drawRect('stretch', W, H, 628, 782, 7, -13, top, right, left, bottom);
  assert.strictEqual(geser.clipX - nol.clipX, -13, 'stretch: kotak bergeser mendatar');
  assert.strictEqual(geser.clipY - nol.clipY, 7, 'stretch: kotak bergeser vertikal');
  assert.strictEqual(geser.clipW, nol.clipW, 'stretch: ukuran area tetap');
});

test('kalibrasi dihormati di ketiga mode', () => {
  const { W, H, top, right, left, bottom } = POL;
  for (const mode of ['fit', 'cover', 'stretch'] as const) {
    const nol = drawRect(mode, W, H, 628, 782, 0, 0, top, right, left, bottom);
    const maju = drawRect(mode, W, H, 628, 782, 12, 0, top, right, left, bottom);
    assert.strictEqual(maju.clipY - nol.clipY, 12, `${mode}: kotak bergeser vertikal 12 px`);
    assert.strictEqual(maju.clipW, nol.clipW, `${mode}: lebar area tidak berubah`);
    assert.strictEqual(maju.clipH, nol.clipH, `${mode}: tinggi area tidak berubah`);
  }
});

test('kalibrasi berhenti di batas kepala cetak tanpa mengecilkan area', () => {
  const { W, H, top, right, left, bottom } = POL;
  // Offset jauh melebihi ruang yang ada: kotak harus BERHENTI di batas, bukan
  // mengecil. Kalau ukurannya berubah, yang terjadi bukan kalibrasi tapi crop.
  // printhead diteruskan seperti di aplikasi; tanpa itu kanvas dianggap bisa dicetak penuh.
  const jauh = drawRect('cover', W, H, 628, 782, 0, 500, top, right, left, bottom, B1_PRO_PRINTHEAD_PX);
  const nol = drawRect('cover', W, H, 628, 782, 0, 0, top, right, left, bottom, B1_PRO_PRINTHEAD_PX);
  assert.strictEqual(jauh.clipW, nol.clipW, 'lebar area tetap walau offset ekstrem');
  assert.strictEqual(jauh.clipH, nol.clipH, 'tinggi area tetap walau offset ekstrem');
  // Dan tidak ada tinta yang dijanjikan di luar kepala cetak.
  assert.ok(jauh.clipX + jauh.clipW <= 576, 'tepi kanan area tidak melewati kepala cetak');
});

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




// --- Kotak cetak dari margin empat sisi (template label Polaroid) ---
//
// Label NIIMBOT Polaroid 54 x 67 mm sudah punya bingkai tercetak; hanya kotak di
// tengahnya boleh diisi. Marginnya: atas 6 mm, kanan 3 mm, kiri 3 mm, bawah 15 mm.
// Angka bawah 15, bukan 14, supaya kotaknya persis 46 mm — 6 + 46 + 14 = 66,
// sedangkan kertasnya 67 mm, jadi ada 1 mm yang harus jatuh ke suatu sisi.
const POLAROID = { W: 638, H: 791, top: 71, right: 78, left: 17, bottom: 177 };

test('printBox menempatkan area cetak sesuai margin empat sisi', () => {
  const b = printBox(POLAROID.W, POLAROID.H, POLAROID.top, POLAROID.right, POLAROID.left, POLAROID.bottom);
  assert.strictEqual(b.x, 17, 'kiri 17 px');
  assert.strictEqual(b.y, 71, 'atas 71 px');
  // Area = 638 - 17 - 78 = 543 px, dan 791 - 71 - 177 = 543 px.
  // 543 px pada 300 dpi = 45,97 mm -> target 46 x 46 mm terpenuhi (selisih 0,03 mm).
  assert.strictEqual(b.w, 543, 'lebar area 46 mm');
  assert.strictEqual(b.h, 543, 'tinggi area 46 mm');
  assert.strictEqual(mmToPx(46), 543, '46 mm = 543 px pada 300 dpi');
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

test('offset menggeser SELURUH kotak cetak, bukan gambar di dalamnya', () => {
  const { W, H, top, right, left, bottom } = POLAROID;
  const a = drawRect('cover', W, H, 628, 782, 0, 0, top, right, left, bottom);
  const geser = drawRect('cover', W, H, 628, 782, 9, 24, top, right, left, bottom);

  // Inti kalibrasi: KOTAK yang pindah, beserta isinya.
  assert.strictEqual(geser.clipX - a.clipX, 24, 'kotak bergeser 24 px mendatar');
  assert.strictEqual(geser.clipY - a.clipY, 9, 'kotak bergeser 9 px vertikal');
  assert.strictEqual(geser.dx - a.dx, 24, 'foto ikut bergeser bersama kotak');
  assert.strictEqual(geser.dy - a.dy, 9, 'foto ikut bergeser bersama kotak');

  // Dan yang TIDAK boleh berubah: ukuran area cetak. Kalau ukurannya berubah,
  // yang terjadi bukan kalibrasi melainkan crop.
  assert.strictEqual(geser.clipW, a.clipW, 'lebar area cetak tidak berubah');
  assert.strictEqual(geser.clipH, a.clipH, 'tinggi area cetak tidak berubah');
  assert.strictEqual(geser.dw, a.dw, 'lebar foto tidak berubah (tidak ada scaling)');
  assert.strictEqual(geser.dh, a.dh, 'tinggi foto tidak berubah (tidak ada scaling)');
});

test('foto tidak pernah keluar dari kotak walau offset besar', () => {
  const { W, H, top, right, left, bottom } = POLAROID;
  // Kalau offset diterapkan pada gambar (bukan kotak), foto akan keluar kotak
  // dan terpotong. Untuk setiap offset, tepi foto harus tetap di dalam kotak.
  for (const [ox, oy] of [[0, 0], [50, 0], [-50, 0], [0, 60], [30, -40], [-24, 59]]) {
    const r = drawRect('cover', W, H, 628, 782, oy, ox, top, right, left, bottom);
    assert.ok(r.dx <= r.clipX + 1, `x=${ox} y=${oy}: tepi kiri foto tidak keluar kotak`);
    assert.ok(r.dy <= r.clipY + 1, `x=${ox} y=${oy}: tepi atas foto tidak keluar kotak`);
    assert.ok(r.dx + r.dw >= r.clipX + r.clipW - 1, `x=${ox} y=${oy}: sisi kanan kotak terisi`);
    assert.ok(r.dy + r.dh >= r.clipY + r.clipH - 1, `x=${ox} y=${oy}: sisi bawah kotak terisi`);
    // Ukuran kotak selalu sama: 46 x 46 mm.
    assert.strictEqual(r.clipW, 543, `x=${ox} y=${oy}: lebar area cetak tetap 46 mm`);
    assert.strictEqual(r.clipH, 543, `x=${ox} y=${oy}: tinggi area cetak tetap 46 mm`);
  }
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
