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
import { labelSize, mmToPx, labelMmFromPaperSize, drawRect, firstSlot, DEFAULT_LABEL_MM, B1_PRO_PRINTHEAD_PX, LABEL_DPI } from './labelGeometry.ts';

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

test('kertas 54 x 67 mm: diperkecil agar utuh, rasio kertas terjaga', () => {
  // Inilah kertas yang dipakai. Kertas lebih lebar daripada kepala cetak, jadi
  // gambarnya diperkecil dengan faktor yang sama untuk lebar dan tinggi —
  // BUKAN tinggi dibiarkan penuh. Kalau hanya lebarnya yang dipotong, rasio
  // berubah jadi 576/791 = 0,73 padahal kertasnya 0,81, sehingga gambar gepeng
  // dan tepi kanan hilang tanpa pesan error.
  const s = labelSize(54, 67);
  assert.strictEqual(s.requestedWidthPx, 638, 'lebar yang diminta');
  assert.strictEqual(s.widthPx, 576, 'dikunci ke kepala cetak');
  assert.strictEqual(s.clamped, true, 'harus ditandai supaya bisa diberitahukan');

  // Tinggi ikut diskalakan: 791 x (576/638) = 714.
  assert.strictEqual(s.heightPx, 714, 'tinggi ikut diskalakan, bukan dibiarkan penuh');

  // Yang menentukan hasil cetak: rasio gambar harus tetap rasio kertas.
  const aspectKertas = 54 / 67;
  const aspectGambar = s.widthPx / s.heightPx;
  assert.ok(Math.abs(aspectGambar - aspectKertas) < 0.005,
    `rasio harus tetap ${aspectKertas.toFixed(3)}, dapat ${aspectGambar.toFixed(3)}`);
});

test('tidak ada bagian gambar yang hilang saat kertas dilebarkan', () => {
  // Inti keluhan "tidak ke print semua": sebelumnya 62 px (5,25 mm) sisi kanan
  // terbuang. Sekarang gambarnya diperkecil supaya seluruhnya muat.
  const s = labelSize(54, 67);
  assert.ok(s.widthPx <= B1_PRO_PRINTHEAD_PX, 'lebar tidak boleh melebihi kepala cetak');
  assert.strictEqual(s.widthPx, B1_PRO_PRINTHEAD_PX, 'lebar dipakai penuh');
  // Tinggi hasil skala harus proporsional, bukan sisa yang menyebabkan gepeng.
  assert.ok(s.heightPx < mmToPx(67), 'tinggi mengecil mengikuti skala');
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

test('rasio label selalu sama dengan rasio kertas, berapa pun ukurannya', () => {
  // Regresi: sebelumnya hanya lebar yang dikunci ke kepala cetak sementara
  // tinggi dibiarkan penuh, sehingga rasio berubah dan gambar gepeng. Sekarang
  // keduanya diskalakan dengan faktor yang sama.
  const kertas: Array<[number, number]> = [[54, 67], [48, 150], [60, 40], [40, 30], [90, 100]];
  for (const [w, h] of kertas) {
    const s = labelSize(w, h);
    const rasioKertas = w / h;
    const rasioGambar = s.widthPx / s.heightPx;
    assert.ok(Math.abs(rasioGambar - rasioKertas) < 0.02,
      `kertas ${w}x${h} mm: rasio gambar ${rasioGambar.toFixed(3)} harus mendekati ${rasioKertas.toFixed(3)}`);
  }
});

test('lebar kertas yang lebih kecil dari kepala cetak tidak diperkecil', () => {
  const s = labelSize(40, 30);
  assert.strictEqual(s.clamped, false);
  assert.strictEqual(s.widthPx, mmToPx(40), 'dipakai apa adanya, tidak diperkecil');
  assert.strictEqual(s.heightPx, mmToPx(30));
});

// Foto kamera lanskap 4:3 pada label tegak 576 x 714 px. Kasus nyata: inilah
// yang menghasilkan bingkai putih di sisi atas/bawah.
const LABEL_W = 576, LABEL_H = 714, FOTO_W = 1600, FOTO_H = 1200;

test('mode cover: label terisi penuh, tidak ada bingkai', () => {
  const r = drawRect('cover', LABEL_W, LABEL_H, FOTO_W, FOTO_H);
  assert.ok(r.dw >= LABEL_W, `lebar ${r.dw} harus menutupi label ${LABEL_W}`);
  assert.ok(r.dh >= LABEL_H, `tinggi ${r.dh} harus menutupi label ${LABEL_H}`);
  // Menutupi penuh = tidak ada tepi label yang dibiarkan putih.
  assert.ok(r.dx <= 0 && r.dx + r.dw >= LABEL_W, 'harus menutupi dari tepi kiri ke kanan');
  assert.ok(r.dy <= 0 && r.dy + r.dh >= LABEL_H, 'harus menutupi dari tepi atas ke bawah');
});

test('mode cover menjaga rasio foto, jadi tidak gepeng', () => {
  const r = drawRect('cover', LABEL_W, LABEL_H, FOTO_W, FOTO_H);
  const rasioFoto = FOTO_W / FOTO_H;
  const rasioGambar = r.dw / r.dh;
  // +2 px padding membuat selisih kecil; yang penting tidak mendekati gepeng.
  assert.ok(Math.abs(rasioGambar - rasioFoto) < 0.02,
    `rasio harus tetap ${rasioFoto.toFixed(3)}, dapat ${rasioGambar.toFixed(3)}`);
});

test('mode fit: seluruh foto masuk, sisa label dibiarkan putih', () => {
  const r = drawRect('fit', LABEL_W, LABEL_H, FOTO_W, FOTO_H);
  // Seluruh foto masuk berarti gambar tidak melebihi label.
  assert.ok(r.dw <= LABEL_W, `lebar ${r.dw} tidak boleh melebihi label ${LABEL_W}`);
  assert.ok(r.dh <= LABEL_H, `tinggi ${r.dh} tidak boleh melebihi label ${LABEL_H}`);
  // Dan memang ada sisa (inilah bingkai putihnya).
  assert.ok(r.dh < LABEL_H, 'pada foto lanskap harus ada sisa di atas/bawah');
  // Tetap terpusat, bukan menempel ke satu sisi.
  assert.ok(Math.abs(r.dy - (LABEL_H - r.dh) / 2) <= 1, 'harus terpusat vertikal');
});

test('mode stretch: mengisi label dengan merusak rasio', () => {
  const r = drawRect('stretch', LABEL_W, LABEL_H, FOTO_W, FOTO_H);
  assert.strictEqual(r.dw, LABEL_W);
  assert.strictEqual(r.dh, LABEL_H);
  assert.strictEqual(r.dx, 0);
  assert.strictEqual(r.dy, 0);
});

test('mode cover memakai skala sekecil mungkin yang masih menutupi', () => {
  // Ukuran kelebihan bergantung rasio foto — foto lanskap di label tegak memang
  // terpotong banyak lebarnya, dan itu wajar. Yang harus diperiksa bukan
  // persentase terpotong, melainkan bahwa skalanya TEPAT sebesar yang perlu:
  // sisi yang paling ketat harus pas 1,0 (dengan toleransi padding 2 px).
  const r = drawRect('cover', LABEL_W, LABEL_H, FOTO_W, FOTO_H);
  const kecukupan = Math.min(r.dw / LABEL_W, r.dh / LABEL_H);
  assert.ok(kecukupan >= 1, 'harus menutupi label');
  assert.ok(kecukupan < 1.01,
    `skala harus sepas-pasnya, bukan berlebihan (dapat ${kecukupan.toFixed(4)})`);
});

test('mode cover: sisi yang ketat menempel, bukan ada celah', () => {
  // Untuk foto lanskap di label tegak, TINGGI yang menempel penuh dan lebar
  // yang berlebih. Kalau terbalik, skalanya salah rumus (min vs max).
  const r = drawRect('cover', LABEL_W, LABEL_H, FOTO_W, FOTO_H);
  assert.ok(Math.abs(r.dh - LABEL_H) <= 2, `tinggi harus menempel label, dapat ${r.dh} vs ${LABEL_H}`);
  assert.ok(r.dw > LABEL_W, 'lebar harus berlebih supaya tidak ada bingkai kiri/kanan');
});

test('geser vertikal dari Admin tetap dihormati di ketiga mode', () => {
  for (const mode of ['fit', 'cover', 'stretch'] as const) {
    const tanpa = drawRect(mode, LABEL_W, LABEL_H, FOTO_W, FOTO_H, 0);
    const geser = drawRect(mode, LABEL_W, LABEL_H, FOTO_W, FOTO_H, -40);
    assert.strictEqual(geser.dy, tanpa.dy - 40, `mode ${mode}: geser -40 harus menaikkan gambar 40 px`);
  }
});

test('ukuran gambar rusak tidak menghasilkan NaN', () => {
  for (const mode of ['fit', 'cover', 'stretch'] as const) {
    const r = drawRect(mode, LABEL_W, LABEL_H, 0, 0);
    for (const [k, v] of Object.entries(r)) {
      assert.ok(Number.isFinite(v), `mode ${mode}: ${k} harus angka, dapat ${v}`);
    }
  }
});

// --- Area cetak: hanya isi slot, bukan seluruh kanvas layout ---
// Slot bawaan 1x1 dari storageService: { x: 40, y: 40, width: 628, height: 782 }
// di kanvas 708 x 1062. Inilah area yang dibingkai frame saat foto diambil.
const SLOT_1X1 = [{ x: 40, y: 40, width: 628, height: 782 }];

test('area cetak memakai ukuran slot, bukan seluruh kanvas layout', () => {
  const slot = firstSlot(SLOT_1X1);
  assert.deepEqual(slot, { width: 628, height: 782 });
  // Kanvas layout 708x1062; kalau yang tercetak kanvas penuh, bagian luar
  // bingkai ikut terbawa — itulah keluhan "seluruh bagian foto ter-print".
  assert.notStrictEqual(slot!.width, 708, 'tidak boleh memakai lebar kanvas layout');
  assert.notStrictEqual(slot!.height, 1062, 'tidak boleh memakai tinggi kanvas layout');
  assert.ok(slot!.width < 708 && slot!.height < 1062, 'harus lebih kecil dari kanvas');
});

test('rasio area cetak mengikuti slot, bukan rasio kanvas', () => {
  const slot = firstSlot(SLOT_1X1)!;
  const rasioSlot = slot.width / slot.height;      // 0,803
  const rasioKanvas = 708 / 1062;                  // 0,667
  assert.ok(Math.abs(rasioSlot - rasioKanvas) > 0.1,
    'rasio slot dan kanvas memang berbeda — itu sebabnya harus memakai slot');
  // Dan slot harus mendekati rasio kertas label, supaya tidak gepeng.
  const s = labelSize(54, 67);
  assert.ok(Math.abs(rasioSlot - s.widthPx / s.heightPx) < 0.01,
    `rasio slot ${rasioSlot.toFixed(3)} harus dekat rasio label ${(s.widthPx / s.heightPx).toFixed(3)}`);
});

test('slot rusak tidak menghasilkan area cetak', () => {
  // null dikembalikan supaya pemanggil memakai cadangan, bukan mencetak
  // seluruh kanvas tanpa disadari.
  for (const bad of [null, undefined, [], [{ width: 0, height: 100 }],
                     [{ width: 100, height: 0 }], [{ width: -5, height: 100 }],
                     [{ width: 'x', height: 100 }]]) {
    assert.strictEqual(firstSlot(bad as any), null, `slot ${JSON.stringify(bad)} harus ditolak`);
  }
});

test('ukuran slot dibulatkan ke piksel utuh', () => {
  const slot = firstSlot([{ x: 40.4, y: 39.6, width: 628.5, height: 782.4 }]);
  assert.deepEqual(slot, { width: 629, height: 782 });
  assert.ok(Number.isInteger(slot!.width) && Number.isInteger(slot!.height),
    'canvas.width/height harus bilangan bulat');
});

// --- Geser mendatar (kalibrasi registrasi kertas) ---
test('geser mendatar memindahkan gambar tanpa mengubah ukurannya', () => {
  const W = 576, H = 720, IW = 1600, IH = 1200;
  const nol = drawRect('cover', W, H, IW, IH, 0, 0);
  const kanan = drawRect('cover', W, H, IW, IH, 0, 24);
  const kiri = drawRect('cover', W, H, IW, IH, 0, -24);
  // Ukuran tidak boleh berubah: kalibrasi posisi bukan penyekalaan.
  assert.strictEqual(kanan.dw, nol.dw, 'lebar gambar tidak berubah');
  assert.strictEqual(kanan.dh, nol.dh, 'tinggi gambar tidak berubah');
  // Pindah persis sebesar offset, relatif ke posisi terpusat.
  assert.strictEqual(kanan.dx - nol.dx, 24, 'positif menggeser ke kanan');
  assert.strictEqual(kiri.dx - nol.dx, -24, 'negatif menggeser ke kiri');
  // Dan sumbu lain tidak ikut bergerak.
  assert.strictEqual(kanan.dy, nol.dy, 'geser mendatar tidak mengubah posisi vertikal');
});

test('geser mendatar dan vertikal berdiri sendiri-sendiri', () => {
  const W = 576, H = 720, IW = 1600, IH = 1200;
  // a: geser kanan 20, turun 10.  b: geser kiri 40, naik 30.
  const a = drawRect('cover', W, H, IW, IH, 10, 20);
  const b = drawRect('cover', W, H, IW, IH, -30, -40);
  assert.strictEqual(a.dx - b.dx, 60, 'selisih mendatar = 20 - (-40)');
  assert.strictEqual(a.dy - b.dy, 40, 'selisih vertikal = 10 - (-30)');
});

test('geser mendatar juga berlaku pada mode stretch', () => {
  // Mode stretch punya jalur lebih awal (base), jadi offset harus dihitung di
  // sana juga — kalau tidak, kalibrasi diam-diam tidak bekerja untuk mode itu.
  const nol = drawRect('stretch', 576, 720, 1600, 1200, 0, 0);
  const geser = drawRect('stretch', 576, 720, 1600, 1200, 7, -13);
  assert.strictEqual(geser.dx - nol.dx, -13, 'stretch: mendatar ikut bergeser');
  assert.strictEqual(geser.dy - nol.dy, 7, 'stretch: vertikal ikut bergeser');
  // Ukuran tetap penuh kanvas pada stretch.
  assert.strictEqual(geser.dw, 576, 'stretch memenuhi lebar kanvas');
});

// --- Margin kosong: "mulai cetak setelah 0,5 cm" ---
test('margin atas memulai cetak setelah sekian piksel dari tepi', () => {
  const W = 576, H = 541, IW = 628, IH = 782;
  const nol = drawRect('cover', W, H, IW, IH, 0, 0, 0, 0);
  const m59 = drawRect('cover', W, H, IW, IH, 0, 0, 59, 0);

  // 590,5 px = 0,5 cm tidak bulat; 59 px = 5,00 mm pada 300 dpi.
  assert.strictEqual(m59.clipY, 59, 'mulai cetak 59 px dari tepi atas');
  assert.strictEqual(m59.clipH, H - 59, 'tinggi bidang cetak berkurang sebanyak margin');
  // Tanpa margin, seluruh kanvas boleh dicetak.
  assert.strictEqual(nol.clipY, 0, 'tanpa margin mulai dari tepi');
  assert.strictEqual(nol.clipH, H, 'tanpa margin seluruh kanvas');
  // Foto sendiri TIDAK digeser maupun diperkecil oleh margin.
  assert.strictEqual(m59.dy, nol.dy, 'margin tidak menggeser foto');
  assert.strictEqual(m59.dh, nol.dh, 'margin tidak mengubah ukuran foto');
});

test('margin kanan menghentikan cetak sebelum tepi kanan', () => {
  const W = 576, H = 541, IW = 628, IH = 782;
  // 0,3 cm = 35 px
  const m = drawRect('cover', W, H, IW, IH, 0, 0, 0, 35);
  assert.strictEqual(m.clipX, 0, 'sisi kiri tidak terpengaruh');
  assert.strictEqual(m.clipW, W - 35, 'lebar bidang cetak berkurang 35 px');
  assert.strictEqual(m.dx, drawRect('cover', W, H, IW, IH, 0, 0, 0, 0).dx, 'foto tidak digeser');
});

test('margin digabung dengan geser tidak saling merusak', () => {
  const W = 576, H = 541, IW = 628, IH = 782;
  // Geser kanan 10 px + margin kiri 20 px: bidang cetak mulai 20 px dari tepi,
  // dan geseran tetap berlaku pada foto.
  const nol = drawRect('cover', W, H, IW, IH, 0, 0, 0, 0);
  const r = drawRect('cover', W, H, IW, IH, 0, 10, 20, 0);
  assert.strictEqual(r.clipY, 20, 'margin atas 20 px');
  assert.strictEqual(r.dx - nol.dx, 10, 'geser mendatar tetap 10 px');
  assert.strictEqual(r.clipH, H - 20);
});

test('margin tidak pernah membuat bidang cetak negatif', () => {
  const W = 576, H = 541, IW = 628, IH = 782;
  // Margin lebih besar dari kanvas: tidak ada yang bisa dicetak, tapi tidak
  // boleh menghasilkan lebar/tinggi negatif yang membuat kanvas rusak.
  const r = drawRect('cover', W, H, IW, IH, 0, 0, 9999, 9999);
  assert.ok(r.clipW >= 0, 'lebar bidang cetak tidak negatif');
  assert.ok(r.clipH >= 0, 'tinggi bidang cetak tidak negatif');
});

test('mode stretch juga menghormati margin', () => {
  const W = 576, H = 541, IW = 628, IH = 782;
  // stretch keluar lebih awal (base); margin harus tetap terhitung di sana.
  const r = drawRect('stretch', W, H, IW, IH, 0, 0, 40, 0);
  assert.strictEqual(r.clipY, 40, 'stretch: margin atas tetap berlaku');
  assert.strictEqual(r.clipH, H - 40, 'stretch: bidang cetak berkurang');
});
