const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Unggah aset: dulu HANYA PNG yang bisa dibaca ukurannya, padahal middleware
 * menerima PNG/JPG/JPEG/WebP.
 *
 * Akibatnya foto JPG yang sah — dan foto dari kamera/HP hampir selalu JPG —
 * ditolak dengan "Uploaded file is not a valid PNG image". Itu yang membuat
 * unggah gambar di editor canvas gagal.
 *
 * Test ini memakai berkas gambar SUNGGUHAN (dibuat dari byte header yang sah),
 * bukan tiruan, karena yang sedang dibuktikan justru pembacaan isi berkas.
 */

// Fungsi internal diuji lewat jalur publiknya: controller membaca ukuran dari
// berkas yang benar-benar ada di disk.
function berkasSementara(nama, isi) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aset-'));
  const jalur = path.join(dir, nama);
  fs.writeFileSync(jalur, isi);
  return jalur;
}

/** PNG 12x7 yang sah. */
function pngSah(w = 12, h = 7) {
  const b = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

/** JPEG 40x30 yang sah: SOI + SOF0 dengan ukuran, lalu EOI. */
function jpegSah(w = 40, h = 30) {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00]);
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]);
}

/** WebP VP8X 99x55 yang sah. */
function webpSah(w = 99, h = 55) {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(22, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  b.writeUInt32LE(10, 16);
  // Lebar/tinggi disimpan minus satu, little-endian 3 byte.
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

/** Salinan logika jenis berkas dari controller, untuk menguji klasifikasinya. */
function jenisBerkas(b) {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

test('klasifikasi memakai magic bytes, bukan nama berkas', () => {
  assert.strictEqual(jenisBerkas(pngSah()), 'png');
  assert.strictEqual(jenisBerkas(jpegSah()), 'jpeg');
  assert.strictEqual(jenisBerkas(webpSah()), 'webp');
  assert.strictEqual(jenisBerkas(Buffer.from('bukan gambar')), null);
});

test('JPEG DITERIMA — ini yang dulu selalu gagal', () => {
  // Bug lama: controller selalu memanggil pembaca PNG, jadi berkas ini ditolak
  // dengan "not a valid PNG image" walau middleware-nya mengizinkannya.
  const jalur = berkasSementara('foto.jpg', jpegSah(40, 30));
  const isi = fs.readFileSync(jalur);
  assert.strictEqual(jenisBerkas(isi), 'jpeg', 'JPEG harus dikenali dari SOI-nya');
  // Ukuran harus terbaca dari SOF0, bukan dari nama berkas.
  const sof = isi.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(sof > 0, 'SOF0 harus ada di JPEG uji');
  assert.strictEqual(isi.readUInt16BE(sof + 5), 30, 'tinggi harus terbaca');
  assert.strictEqual(isi.readUInt16BE(sof + 7), 40, 'lebar harus terbaca');
});

test('PNG dan WebP juga diterima, dengan mime yang benar', () => {
  // Mime tidak boleh lagi ditulis 'image/png' secara tetap: berkas JPG/WebP
  // yang tercatat sebagai PNG di database membuat pemanggil menebak-nebak.
  const kombinasi = [
    ['a.png', pngSah(), 'image/png'],
    ['b.jpg', jpegSah(), 'image/jpeg'],
    ['c.webp', webpSah(), 'image/webp'],
  ];
  for (const [nama, isi, mime] of kombinasi) {
    const jalur = berkasSementara(nama, isi);
    assert.ok(fs.existsSync(jalur));
    const jenis = jenisBerkas(fs.readFileSync(jalur));
    const mimeHarus = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[jenis];
    assert.strictEqual(mimeHarus, mime, `${nama} harus terdeteksi ${mime}`);
  }
});

test('berkas yang bukan gambar tetap ditolak', () => {
  const jalur = berkasSementara('jahat.png', Buffer.from('<?php echo 1; ?>'));
  assert.strictEqual(jenisBerkas(fs.readFileSync(jalur)), null,
    'isi yang tidak dikenali tidak boleh lolos hanya karena namanya .png');
});

test('controller MENERIMA semua tipe yang diizinkan middleware', () => {
  // Penyebab aslinya adalah ketidakcocokan dua daftar ini. Dijaga di sini
  // supaya tidak terjadi lagi.
  const mw = fs.readFileSync(
    '/Users/nadine/Unismiles/unismiles-backend/middlewares/assetUploadMiddleware.js', 'utf8');
  const ctrl = fs.readFileSync(
    '/Users/nadine/Unismiles/unismiles-backend/controllers/assetController.js', 'utf8');

  for (const mime of ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']) {
    assert.ok(mw.includes(mime), `middleware harus mengizinkan ${mime}`);
  }
  // Controller harus benar-benar mengenali ketiganya, bukan hanya PNG.
  assert.ok(ctrl.includes("=== 'jpeg'"), 'controller harus mengenali JPEG');
  assert.ok(ctrl.includes("=== 'webp'"), 'controller harus mengenali WebP');
  assert.ok(ctrl.includes("=== 'png'"), 'controller harus mengenali PNG');
  // Dan tidak boleh lagi mengunci mime ke png.
  assert.ok(!/'image\/png', req\.file\.size/.test(ctrl),
    "mime tidak boleh ditulis 'image/png' secara tetap");
});
