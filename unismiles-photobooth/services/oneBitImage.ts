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
): void {
  const total = width * height;
  if (total <= 0) return;

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

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const oldValue = gray[p];
      const newValue = oldValue < threshold ? 0 : 255;
      gray[p] = newValue;
      const error = oldValue - newValue;

      // Sebar kesalahan ke tetangga yang BELUM diproses saja (kanan, bawah).
      // Menyebar ke piksel yang sudah diproses akan menghitung ganda.
      if (x + 1 < width) {
        gray[p + 1] += error * FS_RIGHT;
      }
      if (y + 1 < height) {
        if (x > 0) gray[p + width - 1] += error * FS_BOTTOM_LEFT;
        gray[p + width] += error * FS_BOTTOM;
        if (x + 1 < width) gray[p + width + 1] += error * FS_BOTTOM_RIGHT;
      }
    }
  }

  for (let p = 0; p < total; p += 1) {
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
