/**
 * Ubah gambar menjadi hitam-putih murni untuk printer label termal.
 *
 * KENAPA INI WAJIB
 *
 * Printer label termal hanya punya dua keadaan per titik: keluar tinta, atau
 * tidak. Library NiimBlueLib menerjemahkannya seperti ini
 * (`image_encoder.js` baris 73):
 *
 *     else if (color !== 0xffffff) {   // bukan putih murni -> jadi TINTA
 *       blackPixelsOctet |= 1 << (7 - colBit);
 *     }
 *
 * Jadi setiap piksel yang TIDAK PERSIS putih (255,255,255) dicetak hitam penuh.
 * Foto hampir tidak pernah punya piksel yang persis putih — kulit, bayangan, dan
 * latar semua sedikit di bawah 255. Akibatnya seluruh label tercetak hitam
 * pekat, dan itulah gejalanya.
 *
 * Library tidak menyediakan dithering atau ambang sama sekali (sudah diperiksa:
 * tidak ada `dither`, `threshold`, atau `grayscale` di seluruh dist-nya), jadi
 * pengubahan ini harus dilakukan di sisi kita sebelum encoding.
 *
 * CARA KERJA
 *
 * Floyd–Steinberg: tiap piksel dibulatkan ke hitam atau putih, lalu SELISIH
 * kesalahannya dibagikan ke piksel tetangga yang belum diproses. Hasilnya foto
 * tetap terbaca — wajah dan gradasi tetap terlihat sebagai pola titik — bukan
 * gumpalan hitam. Ambang sederhana (tanpa dithering) akan menghitamkan seluruh
 * area yang lebih gelap dari ambang, dan itu justru mengembalikan masalah yang
 * sama dalam bentuk lain.
 *
 * Fungsi ini murni: hanya menyentuh array yang diberikan, tanpa DOM. Itu
 * disengaja supaya bisa DIEKSEKUSI di test, bukan sekadar dicocokkan teksnya —
 * kesalahan di sini hanya terlihat di kertas.
 */

/** Urutan bobot Floyd–Steinberg: kanan, kiri-bawah, bawah, kanan-bawah. */
const FS_RIGHT = 7 / 16;
const FS_BOTTOM_LEFT = 3 / 16;
const FS_BOTTOM = 5 / 16;
const FS_BOTTOM_RIGHT = 1 / 16;

/**
 * Ambang abu-abu. 128 = titik tengah: piksel lebih terang dari ini cenderung
 * menjadi putih, lebih gelap cenderung menjadi hitam. Karena dithering menye-bar
 * kesalahan, nilai ini tidak menentukan seluruh hasil seperti pada ambang biasa —
 * ia hanya menggeser keseimbangan terang/gelap.
 */
export const ONE_BIT_THRESHOLD = 128;

/** Terang piksel versi mata manusia (Rec. 601), dari data RGB. */
export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Ubah data RGBA (di tempat) menjadi hitam-putih murni: hanya 0 atau 255.
 *
 * @param data   Data RGBA dari `getImageData`, diubah langsung.
 * @param width  Lebar gambar, piksel.
 * @param height Tinggi gambar, piksel.
 * @param threshold Ambang abu-abu; lihat ONE_BIT_THRESHOLD.
 */
export function ditherToBlackAndWhite(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  threshold: number = ONE_BIT_THRESHOLD,
  box?: { x: number; y: number; w: number; h: number },
): void {
  const total = width * height;
  if (total <= 0) return;

  // Kotak kerja dibatasi ke bidang cetak. Di luar kotak sudah putih dari
  // latar kanvas, dan hanya di dalam kotak tinta bisa keluar — jadi mengolah
  // seluruh kanvas hanya membuang waktu, sekaligus membuat perhitungan tinta
  // tidak setara dengan yang benar-benar tercetak.
  let x0 = 0, y0 = 0, x1 = width, y1 = height;
  if (box) {
    x0 = Math.max(0, Math.min(width, Math.round(box.x)));
    y0 = Math.max(0, Math.min(height, Math.round(box.y)));
    x1 = Math.max(x0, Math.min(width, x0 + Math.round(box.w)));
    y1 = Math.max(y0, Math.min(height, y0 + Math.round(box.h)));
  }
  if (x1 <= x0 || y1 <= y0) return;

  // Salinan terang piksel sebagai pecahan, karena kesalahan dithering bernilai
  // pecahan dan pembulatan dini akan menghilangkan efeknya.
  const gray = new Float32Array(total);
  for (let p = 0; p < total; p += 1) {
    const i = p * 4;
    // Piksel transparan tidak punya warna; dianggap putih supaya tidak menjadi
    // tinta hanya karena alfanya nol.
    const alpha = data[i + 3];
    gray[p] = alpha === 0 ? 255 : luminance(data[i], data[i + 1], data[i + 2]);
  }

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = y * width + x;
      const oldValue = gray[p];
      const newValue = oldValue < threshold ? 0 : 255;
      gray[p] = newValue;
      const error = oldValue - newValue;

      // Sebar kesalahan ke tetangga yang BELUM diproses saja (kanan, bawah),
      // dan hanya selama tetangganya masih di dalam kotak. Menyebar ke luar
      // kotak akan mengubah piksel yang tidak boleh berisi tinta.
      if (x + 1 < x1) {
        gray[p + 1] += error * FS_RIGHT;
      }
      if (y + 1 < y1) {
        if (x > x0) gray[p + width - 1] += error * FS_BOTTOM_LEFT;
        if (x >= x0 && x < x1) gray[p + width] += error * FS_BOTTOM;
        if (x + 1 < x1) gray[p + width + 1] += error * FS_BOTTOM_RIGHT;
      }
    }
  }

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      const value = gray[p] < threshold ? 0 : 255;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      // Alfa dibuat pekat: encoder membaca RGB, tetapi alfa nol membuat piksel
      // tampak transparan kalau gambar ini dipakai ulang di tempat lain.
      data[i + 3] = 255;
    }
  }
}
