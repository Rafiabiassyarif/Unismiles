const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(backendRoot, 'server.js'), 'utf8');
const uploadMiddleware = fs.readFileSync(path.join(backendRoot, 'middlewares', 'uploadMiddleware.js'), 'utf8');
const assetMiddleware = fs.readFileSync(path.join(backendRoot, 'middlewares', 'assetUploadMiddleware.js'), 'utf8');

/**
 * Bug nyata: gambar frame berhasil di-upload dan tercatat di database, tetapi
 * tidak muncul di Admin — dan kiosk juga tidak bisa mengambilnya.
 *
 * Sebabnya path relatif. Proses backend dijalankan dari root monorepo, sehingga:
 *   express.static('uploads')  -> <root>/uploads          (tidak ada)
 *   cb(null, 'uploads/')       -> menulis ke <root>/uploads (tidak ada)
 * sedangkan berkas sebenarnya ada di <root>/unismiles-backend/uploads.
 * Akibatnya semua URL gambar 404.
 */

test('berkas statis disajikan dengan path absolut', () => {
  // Cari baris kode (bukan komentar) yang memasang static.
  const staticLines = server
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .filter(l => /express\.static\(/.test(l));

  assert.ok(staticLines.length >= 2, 'harus ada penyajian berkas statis');
  for (const line of staticLines) {
    assert.ok(
      !/express\.static\('uploads/.test(line),
      `path relatif akan menunjuk folder yang salah: ${line.trim()}`
    );
    assert.match(line, /uploadsDir|path\.join/, `harus memakai path absolut: ${line.trim()}`);
  }
});

test('folder uploads dihitung dari lokasi berkas, bukan CWD', () => {
  assert.match(server, /const uploadsDir = path\.join\(__dirname, 'uploads'\)/,
    'folder statis harus relatif terhadap __dirname');

  // uploadMiddleware memakai nama `uploadDir` dan menulis ke sana.
  assert.match(uploadMiddleware, /const uploadDir = path\.join\(__dirname, '\.\.\/uploads'\)/,
    'folder tulis harus relatif terhadap __dirname');
  assert.match(uploadMiddleware, /cb\(null, uploadDir\)/,
    'multer harus menulis ke path absolut');

  // Periksa hanya baris kode: komentar penjelas juga menyebut 'uploads/'.
  const codeLines = uploadMiddleware
    .split('\n')
    .filter(l => !l.trim().startsWith('//'));
  assert.ok(
    !codeLines.some(l => /cb\(null, 'uploads\/'\)/.test(l)),
    "path relatif 'uploads/' akan menulis ke folder yang tidak disajikan"
  );
});

test('middleware aset memakai path absolut', () => {
  assert.match(assetMiddleware, /path\.join\(__dirname, '\.\.\/uploads\/assets'\)/,
    'folder aset harus absolut');
});

test('folder uploads dibuat saat modul dimuat', () => {
  // Kalau folder tidak ada, multer gagal menulis dan upload tampak berhasil di UI
  // tetapi berkasnya tidak pernah tersimpan.
  assert.match(uploadMiddleware, /mkdirSync\(uploadDir/, 'folder uploads harus dibuat otomatis');
  assert.match(assetMiddleware, /mkdirSync\(assetDir/, 'folder assets harus dibuat otomatis');
});

test('URL gambar yang dikirim ke kiosk memakai alamat publik', () => {
  const kioskController = fs.readFileSync(
    path.join(backendRoot, 'controllers', 'kioskController.js'), 'utf8'
  );
  assert.match(kioskController, /publicBaseUrl\(req\)/, 'kiosk butuh URL absolut');
});
