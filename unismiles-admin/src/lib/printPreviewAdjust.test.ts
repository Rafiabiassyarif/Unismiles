import test from 'node:test';
import assert from 'node:assert/strict';
import {
  previewPlan, renderPrintBitmap, MEASURED_FRAME, luminance,
  applyAdjust, cameraErrorMessage, frameToImage,
} from './printPapers.ts';

/**
 * Capture foto ada untuk satu alasan: menyetel brightness/contrast harus bisa
 * dinilai pada gambar SUNGGUHAN. Pola uji nilainya seragam, jadi tidak
 * menunjukkan apakah kulit jadi abu-abu atau wajah hilang jadi blok hitam.
 *
 * Yang diuji di sini adalah jalur penyesuaiannya, bukan tampilannya.
 */

// --- Jalur penyesuaian harus BENAR-BENAR mengubah hasil cetak ---
//
// Sebelumnya tidak: dither dijalankan pada piksel mentah, hasil 0/255 itu
// disesuaikan, lalu digambar ulang dari piksel mentah — sehingga preview
// menampilkan hasil yang sama untuk brightness 50% dan 150%, padahal di kertas
// hasilnya berbeda jauh. Test ini yang menahannya.

/** Foto sintetis: gradien + blok gelap, mewakili wajah dan bayangan. */
function fotoSintetis(w: number, h: number) {
  return (sx: number, sy: number): [number, number, number] => {
    const x = sx / Math.max(1, w - 1), y = sy / Math.max(1, h - 1);
    if (x > 0.35 && x < 0.65 && y > 0.3 && y < 0.7) return [70, 62, 55];   // "wajah", agak gelap
    if (x < 0.15 && y < 0.15) return [250, 250, 250];                      // highlight
    const v = Math.round(90 + 120 * (0.5 * x + 0.5 * y));
    return [v, v, v];
  };
}

/** Jalankan jalur cetak produksi dan hitung tinta yang keluar. */
function cetak(brightness: number, contrast: number, saturation = 100) {
  const plan = previewPlan('nimbotpaper-polaroid', MEASURED_FRAME);
  const data = new Uint8ClampedArray(plan.canvasW * plan.canvasH * 4).fill(255);
  const imgW = 628, imgH = 782;
  const mentah = fotoSintetis(imgW, imgH);

  // Urutan yang sama dengan komponen: sesuaikan piksel SUMBER, lalu dither.
  const sample = (sx: number, sy: number) => {
    if (brightness === 100 && contrast === 100 && saturation === 100) return mentah(sx, sy);
    return applyAdjust(mentah(sx, sy), brightness, contrast, saturation);
  };
  renderPrintBitmap({ data, width: plan.canvasW, height: plan.canvasH }, { plan, fitMode: 'cover', imgW, imgH, sample });

  let tinta = 0;
  for (let y = plan.box.y; y < plan.box.y + plan.box.h; y += 1) {
    for (let x = plan.box.x; x < plan.box.x + plan.box.w; x += 1) {
      if (data[(y * plan.canvasW + x) * 4] === 0) tinta += 1;
    }
  }
  return tinta;
}

test('brightness benar-benar mengubah jumlah tinta di preview', () => {
  const normal = cetak(100, 100);
  const terang = cetak(150, 100);
  const gelap = cetak(50, 100);
  assert.ok(terang < normal, `150% harus LEBIH TERANG (= lebih sedikit tinta): ${terang} < ${normal}`);
  assert.ok(gelap > normal, `50% harus lebih gelap (= lebih banyak tinta): ${gelap} > ${normal}`);
  // Perubahannya harus terlihat, bukan beda satu-dua titik.
  assert.ok(normal - terang > normal * 0.02, 'selisih brightness harus nyata, bukan pembulatan');
  assert.ok(gelap - normal > normal * 0.02, 'selisih brightness harus nyata, bukan pembulatan');
});

test('contrast benar-benar mengubah sebaran tinta', () => {
  const normal = cetak(100, 100);
  const tinggi = cetak(100, 150);
  assert.notStrictEqual(tinggi, normal, 'contrast 150% harus mengubah hasil, bukan diabaikan');
});

test('urutan penyesuaian cocok dengan ctx.filter: c*kb, lalu kontras di sekitar 128, lalu saturasi', () => {
  // Nilai netral tidak boleh mengubah apa pun.
  assert.deepEqual(applyAdjust([123, 45, 200], 100, 100, 100), [123, 45, 200]);
  // Brightness mengalikan.
  assert.deepEqual(applyAdjust([100, 100, 100], 150, 100, 100), [150, 150, 150]);
  // Contrast bergerak di sekitar 128: 128 tetap, lebih terang makin terang.
  assert.deepEqual(applyAdjust([128, 128, 128], 100, 150, 100), [128, 128, 128]);
  assert.ok(applyAdjust([200, 200, 200], 100, 150, 100)[0] > 200);
  assert.ok(applyAdjust([60, 60, 60], 100, 150, 100)[0] < 60);
  // Saturasi 0 = hitam putih: ketiga kanal jadi sama.
  const [r, g, b] = applyAdjust([200, 100, 50], 100, 100, 0);
  assert.ok(r === g && g === b, `saturasi 0 harus hitam-putih, dapat ${r},${g},${b}`);
  assert.ok(Math.abs(r - luminance(200, 100, 50)) <= 1, 'abu-abu = terang Rec.601 dari warna asal');
  // Selalu di dalam 0..255 walau nilainya ekstrem.
  for (const v of [[0, 0, 0], [255, 255, 255], [255, 0, 128]] as [number, number, number][]) {
    for (const [b2, c2, s2] of [[50, 50, 0], [150, 150, 150], [150, 50, 100]] as [number, number, number][]) {
      const out = applyAdjust(v, b2, c2, s2);
      assert.ok(out.every(x => x >= 0 && x <= 255), `nilai ${out} harus di dalam 0..255`);
    }
  }
});

test('tinta masih hanya di dalam kotak setelah penyesuaian', () => {
  // Penyesuaian tidak boleh membuat piksel bocor ke luar kotak cetak.
  const plan = previewPlan('nimbotpaper-polaroid', MEASURED_FRAME);
  const data = new Uint8ClampedArray(plan.canvasW * plan.canvasH * 4).fill(255);
  const imgW = 628, imgH = 782;
  const mentah = fotoSintetis(imgW, imgH);
  renderPrintBitmap({ data, width: plan.canvasW, height: plan.canvasH }, {
    plan, fitMode: 'cover', imgW, imgH,
    sample: (sx, sy) => applyAdjust(mentah(sx, sy), 50, 150, 100),
  });
  let liar = 0;
  for (let y = 0; y < plan.canvasH; y += 1) {
    for (let x = 0; x < plan.canvasW; x += 1) {
      if (data[(y * plan.canvasW + x) * 4] === 0) {
        if (x < plan.box.x || x >= plan.box.x + plan.box.w || y < plan.box.y || y >= plan.box.y + plan.box.h) liar += 1;
      }
    }
  }
  assert.strictEqual(liar, 0, 'brightness/contrast tidak boleh menggeser bidang cetak');
});

// --- Pesan galat kamera ---

test('kegagalan kamera dijelaskan, bukan sekadar "gagal"', () => {
  assert.match(cameraErrorMessage({ name: 'NotAllowedError' }), /Izin kamera ditolak/);
  assert.match(cameraErrorMessage({ name: 'NotFoundError' }), /Tidak ada kamera/);
  assert.match(cameraErrorMessage({ name: 'NotReadableError' }), /dipakai aplikasi lain/);
  assert.match(cameraErrorMessage({ name: 'OverconstrainedError' }), /Tidak ada kamera/);
  // Nama galat yang tidak dikenal tetap menyebut pesannya, tidak mengarang.
  assert.match(cameraErrorMessage({ name: 'Weird', message: 'boom' }), /boom/);
  assert.match(cameraErrorMessage(null), /Kamera gagal dibuka|tidak mendukung/);
});

test('capture menolak video yang belum siap, tanpa mengembalikan gambar kosong', async () => {
  // Video dengan ukuran 0 = kamera belum memberi frame. Mengembalikan gambar
  // kosong akan membuat operator menyetel brightness pada layar hitam.
  await assert.rejects(() => frameToImage({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement), /belum siap/);
});
