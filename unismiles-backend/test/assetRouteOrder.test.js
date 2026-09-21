const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..');
const adminRoot = path.join(backendRoot, '..', 'unismiles-admin', 'src');

const server = fs.readFileSync(path.join(backendRoot, 'server.js'), 'utf8');
const templates = fs.readFileSync(path.join(adminRoot, 'pages', 'TemplateManagement.tsx'), 'utf8');
const assetsLib = fs.readFileSync(path.join(adminRoot, 'lib', 'assets.ts'), 'utf8');

/**
 * Bug nyata: gambar frame berhasil di-upload (tersimpan ke database dan disk)
 * tetapi tidak muncul di Admin, sehingga pengguna mengira upload-nya gagal.
 *
 * Tiga sebabnya:
 *   1. Route /api/v1/admin/assets dipasang SETELAH /api/v1/admin, jadi tertutup
 *      dan selalu jatuh ke router admin yang tidak punya route aset (404).
 *   2. Daftar aset dibaca dengan type='logo', padahal gambar frame disimpan
 *      sebagai 'overlay'.
 *   3. Nama field unggahan harus cocok dengan multer: 'asset'.
 */

test('route aset dipasang sebelum route admin umum', () => {
  // Hanya baris kode yang dihitung — komentar penjelas juga menyebut kedua path
  // ini, jadi pencarian teks biasa bisa tertipu (bug yang sempat terjadi di test ini).
  const codeLines = server
    .split('\n')
    .filter(line => !line.trim().startsWith('//'));

  const assetIndex = codeLines.findIndex(l => /app\.use\('\/api\/v1\/admin\/assets'/.test(l));
  const adminIndex = codeLines.findIndex(l => /app\.use\('\/api\/v1\/admin',\s*adminRoutes\)/.test(l));

  assert.ok(assetIndex > -1, 'route aset harus ada');
  assert.ok(adminIndex > -1, 'route admin umum harus ada');
  assert.ok(
    assetIndex < adminIndex,
    'route aset harus LEBIH DULU; kalau tidak, /api/v1/admin menangkapnya dan aset selalu 404'
  );
});

test('daftar aset memuat overlay, bukan hanya logo', () => {
  assert.match(
    templates,
    /fetchReusableAssets\('overlay'\)/,
    'gambar frame disimpan sebagai overlay, jadi harus ikut dibaca'
  );
  assert.match(templates, /fetchReusableAssets\('logo'\)/, 'aset logo tetap dibaca');
});

test('field unggahan cocok dengan multer di backend', () => {
  // Frontend mengirim form.append('asset', file); route memakai upload.single('asset').
  assert.match(assetsLib, /form\.append\('asset'/, 'frontend harus memakai nama field "asset"');
  const assetRoutes = fs.readFileSync(
    path.join(backendRoot, 'routes', 'v1', 'assetRoutes.js'), 'utf8'
  );
  assert.match(assetRoutes, /upload\.single\('asset'\)/, 'backend harus menerima field "asset"');
});

test('template yang dikirim ke kiosk menyertakan URL gambar absolut', () => {
  const kioskController = fs.readFileSync(
    path.join(backendRoot, 'controllers', 'kioskController.js'), 'utf8'
  );
  // Kiosk perlu URL penuh, bukan path relatif seperti /uploads/assets/...
  assert.match(kioskController, /startsWith\('http'\)/,
    'URL gambar harus dijadikan absolut untuk kiosk');
  assert.match(kioskController, /publicBaseUrl\(req\)/,
    'alamat publik harus dipakai menyusun URL gambar');
});

test('template dikirim dengan gambar DAN konfigurasi overlay', () => {
  const kioskController = fs.readFileSync(
    path.join(backendRoot, 'controllers', 'kioskController.js'), 'utf8'
  );
  assert.match(kioskController, /overlayUrl/, 'overlayUrl ikut dikirim ke kiosk');
  assert.match(kioskController, /type: 'image'/, 'frame bertipe gambar harus dikenali kiosk');
});
