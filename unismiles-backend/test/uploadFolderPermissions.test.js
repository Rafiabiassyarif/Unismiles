const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..');
const uploadMiddleware = fs.readFileSync(
  path.join(backendRoot, 'middlewares', 'uploadMiddleware.js'), 'utf8');
const assetMiddleware = fs.readFileSync(
  path.join(backendRoot, 'middlewares', 'assetUploadMiddleware.js'), 'utf8');

/**
 * Bug nyata: POST /api/v1/admin/assets menjawab 500 dan di browser hanya tampak
 *   "Failed to load resource: the server responded with a status of 500"
 * sehingga gambar tidak bisa ditambahkan di editor canvas.
 *
 * Sebabnya izin folder, bukan kode unggahnya. Log backend:
 *   [Error] EACCES: permission denied, open
 *     '~/uniinside/Unismiles/unismiles-backend/uploads/assets/<nama>.png'
 *   path: '/api/v1/admin/assets'
 *
 * Folder itu milik uid 1000 (izin 775), sedangkan proses backend berjalan
 * sebagai uid lain. Karena 775 hanya memberi tulis kepada PEMILIK dan grupnya,
 * multer gagal menulis dan melempar EACCES -> 500.
 *
 * Perbaikannya: folder dibuat ulang dan di-chmod 1777 saat modul dimuat, supaya
 * uid mana pun boleh menulis. Diuji di sini supaya tidak hilang lagi.
 */

test('folder unggahan dibuat world-writable supaya uid backend bisa menulis', () => {
  // Tanpa ini, perbaikan manual akan hilang setiap deploy.
  assert.match(uploadMiddleware, /fs\.chmodSync\(uploadDir/,
    'uploadMiddleware harus menyesuaikan izin folder uploads');
  assert.match(assetMiddleware, /fs\.chmodSync\(assetDir/,
    'assetUploadMiddleware harus menyesuaikan izin folder assets');
});

test('memakai bit sticky 1777, bukan 777', () => {
  // 1777 = semua uid boleh menulis, tetapi hanya pemilik berkas yang boleh
  // menghapus milik orang lain. 777 membiarkan siapa pun menghapus berkas siapa pun.
  assert.match(uploadMiddleware, /0o1777/, 'uploads harus 1777');
  assert.match(assetMiddleware, /0o1777/, 'assets harus 1777');
  assert.ok(!/0o777\b/.test(uploadMiddleware), 'uploads tidak boleh 0777 polos');
  assert.ok(!/0o777\b/.test(assetMiddleware), 'assets tidak boleh 0777 polos');
});

test('gagal chmod tidak menggagalkan start backend', () => {
  // Kalau proses bukan pemilik folder, chmod melempar. Itu tidak boleh membuat
  // seluruh backend mati — izinnya mungkin sudah benar.
  for (const [nama, kode] of [['uploadMiddleware', uploadMiddleware],
                              ['assetUploadMiddleware', assetMiddleware]]) {
    const idx = kode.indexOf('chmodSync');
    assert.ok(idx > 0, `${nama}: chmodSync harus ada`);
    // Harus berada di dalam try/catch (dicari ke belakang dari posisinya).
    const sebelum = kode.slice(Math.max(0, idx - 400), idx);
    assert.match(sebelum, /try\s*\{/, `${nama}: chmodSync harus dibungkus try`);
    const sesudah = kode.slice(idx, idx + 200);
    assert.match(sesudah, /catch\s*\(/, `${nama}: harus ada catch setelah chmodSync`);
  }
});

test('folder dibuat sebelum chmod, dan path absolut', () => {
  for (const [nama, kode, variabel, rel] of [
    ['uploadMiddleware', uploadMiddleware, 'uploadDir', "'\\.\\.\\/uploads'"],
    ['assetUploadMiddleware', assetMiddleware, 'assetDir', "'\\.\\.\\/uploads\\/assets'"],
  ]) {
    assert.match(kode, new RegExp(`path\\.join\\(__dirname, ${rel}\\)`),
      `${nama}: ${variabel} harus absolut (relatif terhadap __dirname)`);
    assert.ok(kode.indexOf('mkdirSync') < kode.indexOf('chmodSync'),
      `${nama}: folder harus dibuat SEBELUM chmod`);
  }
});
