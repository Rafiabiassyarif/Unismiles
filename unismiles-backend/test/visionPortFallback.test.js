/**
 * Uji jalur verifikasi pembayaran terhadap port yang SALAH.
 *
 * Kejadian nyata 2026-09-25: .env menunjuk `http://127.0.0.1:5051`. Loopback
 * ditolak normalizer (benar — loopback terisolasi per-site), sehingga client
 * jatuh ke daftar port cadangan yang saat itu dimulai dari 5025. Port 5025
 * ternyata dipakai situs Node LAIN yang menjawab 404 "Route not found".
 *
 * Bug-nya: jawaban HTTP apa pun dulu menghentikan pencarian, dengan alasan
 * "service menjawab berarti alamatnya benar". Untuk 404 alasan itu salah — 404
 * berarti alamat itu memang tidak punya /process. Akibatnya SETIAP pemindaian
 * bukti bayar gagal dengan INTERNAL_ERROR (59 baris di DB) walaupun vision
 * service sehat di port 5051 dan menjawab 200.
 *
 * Uji ini mengunci dua hal: port yang benar didahulukan, dan 404 tidak lagi
 * menghentikan percobaan port berikutnya.
 */

const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const modul = path.join(__dirname, '..', 'utils', 'visionClient.js');

test('port yang terbukti bekerja (5051) didahulukan sebelum 5025', () => {
  const { DEFAULT_VISION_PORTS } = require(modul);
  assert.strictEqual(DEFAULT_VISION_PORTS[0], 5051,
    'port vision service yang benar harus dicoba pertama');
  assert.ok(DEFAULT_VISION_PORTS.includes(5025),
    '5025 tetap dicoba sebagai cadangan, hanya tidak lagi didahulukan');
});

/** Muat modul dalam keadaan bersih — `preferredUrl` disimpan di tingkat modul. */
function muatSegar() {
  const jalur = require.resolve(modul);
  delete require.cache[jalur];
  return require(jalur);
}

test('404 tidak menghentikan pencarian; port berikutnya yang dipakai', async () => {
  const segar = muatSegar();
  const dicoba = [];

  // Port pertama membalas 404 seperti situs asing; port kedua membalas 200.
  global.fetch = async (url) => {
    dicoba.push(String(url));
    if (String(url).includes(':5002')) {
      return {
        ok: false, status: 404,
        text: async () => '{"success":false,"message":"Route not found"}',
      };
    }
    return { ok: true, status: 200, json: async () => ({ schema_version: '1.0' }) };
  };

  const sebelum = process.env.PAYMENT_VISION_SERVICE_URL;
  process.env.PAYMENT_VISION_SERVICE_URL = 'http://192.168.100.185:5002';
  try {
    const hasil = await segar.processFrames([Buffer.from('bukan-gambar-asli')], 'uji-404', '5000');
    assert.deepStrictEqual(hasil, { schema_version: '1.0' },
      'jawaban dari port yang benar harus dikembalikan');
    assert.ok(dicoba.length >= 2, `harus mencoba lebih dari satu alamat, dapat ${dicoba.length}`);
    assert.ok(dicoba[0].includes(':5002'), 'alamat dari env dicoba pertama');
    assert.ok(dicoba.some((u) => !u.includes(':5002')),
      'harus pindah ke alamat berikutnya setelah 404');
  } finally {
    if (sebelum === undefined) delete process.env.PAYMENT_VISION_SERVICE_URL;
    else process.env.PAYMENT_VISION_SERVICE_URL = sebelum;
  }
});

test('404 di SEMUA alamat tetap dilaporkan gagal, bukan lolos diam-diam', async () => {
  const segar = muatSegar();

  global.fetch = async (url) => ({
    ok: false, status: 404,
    text: async () => `{"message":"Route not found","url":"${url}"}`,
  });

  await assert.rejects(
    () => segar.processFrames([Buffer.from('x')], 'uji-semua-404', '5000'),
    /Vision service tidak dapat dihubungi/,
    'kalau tidak ada satu pun alamat punya /process, itu kegagalan nyata',
  );
});
