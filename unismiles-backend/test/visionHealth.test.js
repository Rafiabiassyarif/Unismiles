const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const visionClient = require('../utils/visionClient');
const { resolveVisionCandidates, DEFAULT_VISION_PORTS } = visionClient;

/**
 * Probe kesehatan vision service.
 *
 * Alasannya ada: "apakah scan pembayaran jalan?" sebelumnya hanya bisa dijawab
 * dengan menunggu ada pembeli yang gagal dipindai. Probe ini menjawabnya lebih
 * awal, dan yang diuji di sini adalah bahwa ia memakai ALAMAT YANG SAMA dengan
 * pemrosesan sungguhan — kalau berbeda, hasilnya menenangkan padahal OCR tetap
 * gagal.
 *
 * CATATAN PENTING soal alamat uji: probe SENGAJA menolak localhost/127.0.0.1,
 * karena di server loopback terisolasi per-site dan mengarahkannya ke sana
 * menjamin OCR gagal. Jadi test ini tidak bisa memakai 127.0.0.1 — harus alamat
 * yang routable, seperti IP LAN mesin ini.
 */

/** Alamat non-loopback mesin ini; null kalau tidak ada (uji dilewati). */
function alamatRoutable() {
  for (const daftar of Object.values(os.networkInterfaces())) {
    for (const ni of daftar || []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return null;
}

const LAN = alamatRoutable();

/** Jalankan server HTTP sementara di semua antarmuka. */
function serverSementara(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '0.0.0.0', () => resolve(server));
  });
}

test('probe mengembalikan ok=true dan alamat yang menjawab', { skip: !LAN && 'tidak ada alamat LAN' }, async () => {
  const server = await serverSementara((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"status":"ok"}');
  });
  const port = server.address().port;
  try {
    process.env.PAYMENT_VISION_SERVICE_URL = `http://${LAN}:${port}`;
    const hasil = await visionClient.probe(2000);
    assert.strictEqual(hasil.ok, true, 'server yang menjawab harus dianggap hidup');
    assert.ok(hasil.url.includes(String(port)), `url harus menunjuk ke server (dapat ${hasil.url})`);
    assert.ok(Number.isInteger(hasil.status), 'status HTTP harus dilaporkan');
  } finally {
    delete process.env.PAYMENT_VISION_SERVICE_URL;
    server.close();
  }
});

test('jawaban 4xx/5xx tetap berarti HIDUP — yang dicari alamatnya, bukan endpoint', { skip: !LAN && 'tidak ada alamat LAN' }, async () => {
  // Kalau ada yang MENJAWAB, berarti service-nya ada. Menandainya mati akan
  // membuat operator mengejar masalah yang salah.
  for (const kode of [401, 404, 403, 500]) {
    const server = await serverSementara((req, res) => {
      res.writeHead(kode, { 'Content-Type': 'text/plain' });
      res.end('nope');
    });
    const port = server.address().port;
    try {
      process.env.PAYMENT_VISION_SERVICE_URL = `http://${LAN}:${port}`;
      const hasil = await visionClient.probe(2000);
      assert.strictEqual(hasil.ok, true, `status ${kode} harus dianggap hidup (ada yang menjawab)`);
      assert.strictEqual(hasil.status, kode);
    } finally {
      delete process.env.PAYMENT_VISION_SERVICE_URL;
      server.close();
    }
  }
});

test('alamat loopback ditolak, jadi port tertutup TIDAK dianggap hidup', async () => {
  // 127.0.0.1 dibuang oleh normalizeUrl, jadi yang tersisa adalah port kandidat
  // di host bawaan — dan itu memang tidak menjawab di mesin uji ini.
  process.env.PAYMENT_VISION_SERVICE_URL = 'http://127.0.0.1:1';
  try {
    const hasil = await visionClient.probe(400);
    assert.strictEqual(hasil.ok, false);
    assert.ok(Array.isArray(hasil.dicoba) && hasil.dicoba.length > 0,
      'daftar alamat yang dicoba harus dilaporkan');
    // Setiap catatan harus memuat alamatnya, bukan hanya "fetch failed".
    assert.ok(hasil.dicoba.every((t) => t.includes('http://')), 'tiap percobaan harus menyebut alamatnya');
  } finally {
    delete process.env.PAYMENT_VISION_SERVICE_URL;
  }
});

test('alamat yang SAMA dipakai probe dan pemrosesan sungguhan', () => {
  // Kalau keduanya berbeda, diagnostiknya menenangkan padahal OCR tetap gagal.
  // Keduanya membaca daftar kandidat yang sama.
  const env = { PAYMENT_VISION_SERVICE_URL: 'http://10.0.0.9:6000' };
  const kandidat = resolveVisionCandidates(env);
  assert.strictEqual(kandidat[0], 'http://10.0.0.9:6000', 'alamat dari .env harus dipakai lebih dulu');
  // Dan port kandidat tetap disertakan sebagai cadangan.
  for (const port of DEFAULT_VISION_PORTS) {
    assert.ok(kandidat.some((u) => u.endsWith(`:${port}`)), `port cadangan ${port} harus ada`);
  }
});

test('localhost/127.0.0.1 dari .env DITOLAK — loopback terisolasi per-site', () => {
  // Ini pernah jadi penyebab kegagalan nyata: loopback tidak menunjuk ke vision
  // service dari dalam jail site.
  for (const alamat of ['http://localhost:5025', 'http://127.0.0.1:5025']) {
    const kandidat = resolveVisionCandidates({ PAYMENT_VISION_SERVICE_URL: alamat });
    assert.ok(!kandidat.includes(alamat), `${alamat} tidak boleh dipakai apa adanya`);
  }
});
