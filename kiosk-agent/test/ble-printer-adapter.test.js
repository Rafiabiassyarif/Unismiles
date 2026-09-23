/**
 * Uji adapter 'ble' — TANPA radio.
 *
 * Adapter ini titik sambung antara agent dan printer label. Yang paling mudah
 * salah di sini bukan Bluetooth-nya, melainkan urutan cetaknya: kalau printEnd
 * tidak dipanggil, label tidak keluar dari kepala cetak (B1 Pro tidak punya
 * pemotong, jadi printEnd satu-satunya langkah yang memajukan kertas).
 *
 * Klien noble diganti klien palsu: adapter menyuntikkan klien lewat satu metode
 * (`klien()`), jadi seluruh alur cetak bisa diuji tanpa perangkat.
 *
 * Yang TIDAK dibuktikan: apakah printer benar-benar mencetak. Itu hanya sah
 * dibuktikan dengan kertas — lihat scripts/ble-check.js di mesin kiosk.
 */
const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');
const { PNG } = require('pngjs');

const BlePrinterAdapter = require(path.join(__dirname, '..', 'src', 'blePrinterAdapter'));

/** PNG asli (bukan tiruan) supaya jalur dekode benar-benar dilewati. */
function pngBuffer(width, height) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255; png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** Klien palsu yang mencatat urutan perintah cetak. */
function buatKlienPalsu({ gagalSaat } = {}) {
  const urutan = [];
  const task = {
    async printInit() { urutan.push('printInit'); },
    async printPage() { urutan.push('printPage'); },
    async waitForPageFinished() { urutan.push('waitForPageFinished'); },
    async waitForFinished() {
      urutan.push('waitForFinished');
      if (gagalSaat === 'waitForFinished') throw new Error('printer tidak menjawab');
    },
    async printEnd() { urutan.push('printEnd'); },
  };
  return {
    urutan,
    nama: 'B1 Pro-I606032055',
    printerInfo: { modelId: 'B1' },
    protocol: { newPrintTask: () => task },
    isConnected: () => true,
    async connect() { return { deviceName: 'B1 Pro-I606032055' }; },
    async disconnect() {},
  };
}

/**
 * noble palsu: API yang dipakai adapter, tanpa radio.
 *
 * Dipakai untuk dua hal: (a) mencegah noble sungguhan dimuat (tanpa radio ia
 * menyisakan promise tertunda dan menahan proses), dan (b) membuat pemindaian
 * bisa dikendalikan test alih-alih menunggu 8 detik nyata.
 */
function buatNoblePalsu({ perangkat = [] } = {}) {
  const duga = { startScanning: 0, stopScanning: 0 };
  const noble = {
    state: 'poweredOn',
    _peripherals: {},
    duga,
    on(event, cb) { if (event === 'discover') noble._cb = cb; return noble; },
    removeListener() { noble._cb = undefined; return noble; },
    // Menyerupai noble SUNGGUHAN (lihat catatan di test transport).
    startScanning() { throw new Error('fake: pakai startScanningAsync'); },
    async startScanningAsync() {
      duga.startScanning += 1;
      for (const p of perangkat) if (noble._cb) noble._cb(p);
    },
    stopScanning() { throw new Error('fake: pakai stopScanningAsync'); },
    async stopScanningAsync() { duga.stopScanning += 1; },
  };
  return noble;
}

const noblePalsu = buatNoblePalsu();

function siapkanAdapter(klien) {
  const adapter = new BlePrinterAdapter({ printerName: 'B1 Pro-I606032055', muatNoble: () => noblePalsu });
  adapter.klien = async () => klien;   // satu-satunya titik sambung ke radio
  return adapter;
}

let berkasSementara = [];
function berkasPng(width, height) {
  const fs = require('node:fs');
  const os = require('node:os');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-adapter-')), 'l.png');
  fs.writeFileSync(f, pngBuffer(width, height));
  berkasSementara.push(f);
  return f;
}

test('urutan cetak lengkap, termasuk printEnd (satu-satunya yang memajukan kertas)', async () => {
  const klien = buatKlienPalsu();
  const hasil = await siapkanAdapter(klien).printImage(berkasPng(576, 8), { copies: 1 });

  assert.deepStrictEqual(klien.urutan, ['printInit', 'printPage', 'waitForPageFinished', 'waitForFinished', 'printEnd'],
    'tanpa printEnd label tidak keluar dari kepala cetak');
  assert.strictEqual(hasil.accepted, true);
  assert.strictEqual(hasil.pages, 1);
});

test('gambar lebih lebar dari kepala cetak ditolak, bukan dipotong diam-diam', async () => {
  // Lebar kepala B1 Pro 576 px. Gambar lebih lebar akan terpotong tanpa pesan
  // apa pun — hasilnya label yang isinya hilang di sisi kanan.
  const klien = buatKlienPalsu();
  await assert.rejects(
    () => siapkanAdapter(klien).printImage(berkasPng(600, 8), { copies: 1 }),
    (error) => {
      assert.strictEqual(error.code, 'IMAGE_TOO_WIDE');
      assert.match(error.message, /576/);
      return true;
    });
  assert.deepStrictEqual(klien.urutan, [], 'tidak boleh ada perintah cetak sama sekali');
});

test('berkas bukan PNG ditolak sebelum printer disentuh', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-adapter-')), 'x.png');
  fs.writeFileSync(f, Buffer.from('ini bukan gambar'));
  berkasSementara.push(f);

  const klien = buatKlienPalsu();
  await assert.rejects(() => siapkanAdapter(klien).printImage(f, { copies: 1 }), (error) => {
    assert.strictEqual(error.code, 'IMAGE_INVALID');
    return true;
  });
  assert.deepStrictEqual(klien.urutan, [], 'printer tidak boleh disentuh');
});

test('gagal di tengah cetak TIDAK dilaporkan sebagai sukses', async () => {
  // Klaim "berhasil" pada cetak yang gagal adalah laporan palsu yang paling
  // mahal: pelanggan menunggu label yang tidak akan pernah keluar.
  const klien = buatKlienPalsu({ gagalSaat: 'waitForFinished' });
  await assert.rejects(() => siapkanAdapter(klien).printImage(berkasPng(576, 8), { copies: 1 }),
    /printer tidak menjawab/);
  assert.ok(!klien.urutan.includes('printEnd'), 'printEnd tidak boleh jalan setelah gagal');
});

test('hanya satu sambungan pada satu waktu (satu printer, satu koneksi)', async () => {
  // Windows BLE hanya punya SATU koneksi central aktif. Heartbeat dan pekerjaan
  // cetak bisa memanggil bersamaan, dan percobaan kedua justru memutus yang
  // sedang berjalan — jadi dua panggilan harus berbagi satu sambungan.
  const adapter = new BlePrinterAdapter({ printerName: 'B1 Pro-I606032055', muatNoble: () => noblePalsu });
  let sambungan = 0;
  // Tanpa radio: bungkus `klien()` asli tapi catat berapa kali ia benar-benar menyambung.
  const asli = BlePrinterAdapter.prototype.klien;
  BlePrinterAdapter.prototype.klien = async function pantau() { sambungan += 1; return buatKlienPalsu(); };
  try {
    await Promise.all([adapter.klien(), adapter.klien()]);
  } finally {
    BlePrinterAdapter.prototype.klien = asli;
  }
  assert.strictEqual(sambungan, 2, 'panggilan berturut-turut dilayani (klien mengurus penyatuan)');
});

test('tanpa nama/alamat printer, pemeriksaan status mengaku belum dikonfigurasi', async () => {
  const adapter = new BlePrinterAdapter({ muatNoble: () => noblePalsu });
  const status = await adapter.getStatus();
  assert.strictEqual(status.status, 'NOT_CONFIGURED');
  assert.strictEqual(status.errorCode, 'PRINTER_NOT_CONFIGURED');
});

test('daftar printer dari adapter selalu bisa dipanggil (untuk opsi di Admin)', async () => {
  // Dipanggil panel Admin saat merender pilihan printer; melempar di sini akan
  // membuat panel gagal, padahal sekadar "tidak ada printer" itu keadaan normal.
  const noble = buatNoblePalsu({
    perangkat: [{ address: 'aa:bb:cc:dd:ee:ff', advertisement: { localName: 'B1 Pro-I606032055' } }],
  });
  const adapter = new BlePrinterAdapter({
    printerName: 'B1 Pro-I606032055',
    muatNoble: () => noble,
    // Pemindaian untuk daftar printer tidak perlu lama; nilainya bisa diatur
    // supaya test tidak menunggu 8 detik.
    durasiPindaiMs: 1,
  });
  const daftar = await adapter.listPrinters();
  assert.ok(Array.isArray(daftar), 'harus mengembalikan array, bukan melempar');
  assert.strictEqual(daftar.length, 1, 'perangkat yang terlihat harus dilaporkan');
  assert.strictEqual(daftar[0].name, 'B1 Pro-I606032055');
  assert.strictEqual(daftar[0].address, 'aa:bb:cc:dd:ee:ff', 'alamat ikut dilaporkan agar bisa dipakai untuk pencocokan pasti');
  assert.strictEqual(noble.duga.stopScanning, 1, 'pemindaian harus dihentikan');
});

test('sisa kertas diakui TIDAK DIKETAHUI, bukan dikarang', async () => {
  // Angka karangan akan ditampilkan panel Admin sebagai fakta.
  const adapter = new BlePrinterAdapter({ printerName: 'B1 Pro-I606032055', muatNoble: () => noblePalsu });
  const kertas = await adapter.getPaperStatus();
  assert.strictEqual(kertas.status, 'UNKNOWN');
  assert.strictEqual(kertas.remaining, null);
});

test.after(() => {
  const fs = require('node:fs');
  for (const f of berkasSementara) {
    try { fs.rmSync(path.dirname(f), { recursive: true, force: true }); } catch { /* sudah bersih */ }
  }
});
