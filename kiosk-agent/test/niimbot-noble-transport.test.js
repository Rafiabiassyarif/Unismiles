/**
 * Uji transport NIIMBOT lewat noble — TANPA radio.
 *
 * Kenapa penting: jalur ini ada untuk menghapus izin Web Bluetooth, dan
 * kegagalannya di lapangan selalu berbentuk sama — "menyambung" tetapi tidak ada
 * paket yang mengalir. Penyebab paling sering bukan Bluetooth, melainkan
 * kontrak transport yang tidak dipenuhi: karakteristik yang salah dipilih,
 * subscribe tidak dipanggil, atau paket ditulis dengan bentuk yang tidak
 * diterima noble.
 *
 * noble di sini PALSU dan berperan sebagai perekam: ia mencatat panggilan mana
 * yang terjadi beserta argumennya. Jadi yang diuji adalah KONTRAK, bukan radio.
 *
 * Yang TIDAK dibuktikan di sini (dan tidak bisa): apakah printer benar-benar
 * ditemukan dan mencetak. Itu hanya sah dibuktikan di mesin kiosk dengan
 * Bluetooth hidup — lihat scripts/ble-check.js.
 */
const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const {
  NiimbotNobleClient,
} = require(path.join(__dirname, '..', 'src', 'niimbotNobleClient'));

const NAMA_PRINTER = 'B1 Pro-I606032055';
const ALAMAT_PRINTER = 'aa:bb:cc:dd:ee:ff';

/** Catatan semua panggilan, supaya bisa diperiksa setelah aksi. */
function buatNoblePalsu({ state = 'poweredOn', peripheral = null } = {}) {
  const catatan = { startScanning: 0, stopScanning: 0, listeners: 0 };
  const noble = {
    state,
    _peripherals: peripheral ? { [ALAMAT_PRINTER]: peripheral } : {},
    catatan,
    on(event, cb) { if (event === 'discover') { noble._onDiscover = cb; catatan.listeners += 1; } return noble; },
    removeListener(event, cb) {
      if (event === 'discover' && noble._onDiscover === cb) {
        noble._onDiscover = undefined;
        catatan.listeners -= 1;
      }
      return noble;
    },
    // Menyerupai noble SUNGGUHAN: `startScanning` mengembalikan undefined
    // (tanpa `.catch`), dan `stopScanning` melempar kalau tidak diberi callback.
    // Fake yang lebih canggih daripada kenyataan menyembunyikan kesalahan API.
    startScanning() {
      throw new Error('fake: pakai startScanningAsync, seperti di kode produksi');
    },
    async startScanningAsync() {
      catatan.startScanning += 1;
      // Scan nyata butuh waktu; di sini perangkat langsung "terlihat" kalau ada.
      if (peripheral && noble._onDiscover) setImmediate(() => noble._onDiscover(peripheral));
    },
    stopScanning() { throw new Error('fake: pakai stopScanningAsync'); },
    async stopScanningAsync() { catatan.stopScanning += 1; },
  };
  return noble;
}

function buatPeripheralPalsu({ nama = NAMA_PRINTER, punyaChannel = true } = {}) {
  const duga = { connectAsync: 0, disconnectAsync: 0, discover: 0, subscribe: 0, writes: [] };
  const channel = {
    uuid: '4a1b2c3d',
    properties: ['notify', 'writeWithoutResponse'],
    _onData: null,
    on(event, cb) { if (event === 'data') this._onData = cb; return this; },
    async subscribeAsync() { duga.subscribe += 1; },
    async writeAsync(data, withoutResponse) { duga.writes.push({ data, withoutResponse }); },
  };
  const peripheral = {
    address: ALAMAT_PRINTER,
    advertisement: { localName: nama },
    duga,
    channel,
    async connectAsync() { duga.connectAsync += 1; },
    async disconnectAsync() { duga.disconnectAsync += 1; },
    once() { return this; },
    async discoverAllServicesAndCharacteristicsAsync() {
      duga.discover += 1;
      return { characteristics: punyaChannel ? [channel] : [{ uuid: 'x', properties: {} }] };
    },
  };
  return peripheral;
}

test('transport ini benar-benar memakai basis library (protokol diwarisi)', () => {
  // Kalau kelas dasar tidak terpasang, protokol/heartbeat/mutex hilang dan
  // transport akan "menyambung" tanpa bisa mengirim satu paket pun.
  const noble = buatNoblePalsu();
  const klien = new NiimbotNobleClient({ noble, nama: NAMA_PRINTER });
  assert.strictEqual(typeof klien.protocol, 'object', 'protokol dari library harus ada');
  assert.strictEqual(typeof klien.processRawPacket, 'function', 'pemroses paket harus ada');
  assert.strictEqual(typeof klien.mutex, 'object', 'mutex pengiriman harus ada');
  assert.strictEqual(klien.getType(), 'noble');
  assert.strictEqual(klien.isConnected(), false, 'belum tersambung');
});

test('properties berbentuk ARRAY (noble) tetap dikenali', async () => {
  // Bentuk `properties` noble adalah ARRAY, bukan OBJEK seperti Web Bluetooth.
  // Bug nyata pernah muncul dari sini: printer terlihat, GATT tersambung,
  // layanan terbaca, lalu "karakteristik tidak ditemukan" — seolah printer yang
  // bermasalah, padahal cara membacanya. Sudah terbukti di printer sungguhan.
  const klien = new NiimbotNobleClient({ noble: buatNoblePalsu() });
  const perangkat = {
    discoverAllServicesAndCharacteristicsAsync: async () => ({
      characteristics: [
        { uuid: 'lain', properties: ['read'] },
        { uuid: 'target', properties: ['read', 'writeWithoutResponse', 'write', 'notify'] },
      ],
    }),
  };
  const pilih = await klien.pilihKarakteristik(perangkat);
  assert.strictEqual(pilih.uuid, 'target', 'ARRAY harus dikenali seperti OBJEK');
});

test('properties berbentuk OBJEK (Web Bluetooth) juga tetap dikenali', async () => {
  // Diterima keduanya supaya jalur ini selamat kalau dijalankan dengan shim
  // yang menyerupai Web Bluetooth.
  const klien = new NiimbotNobleClient({ noble: buatNoblePalsu() });
  const perangkat = {
    discoverAllServicesAndCharacteristicsAsync: async () => ({
      characteristics: [{ uuid: 'target', properties: { notify: true, writeWithoutResponse: true } }],
    }),
  };
  const pilih = await klien.pilihKarakteristik(perangkat);
  assert.strictEqual(pilih.uuid, 'target');
});

test('connect() memilih karakteristik notify+writeWithoutResponse dan subscribe', async () => {
  const peripheral = buatPeripheralPalsu();
  const noble = buatNoblePalsu({ peripheral });

  const klien = new NiimbotNobleClient({ noble, nama: NAMA_PRINTER });
  // Heartbeat library jalan otomatis saat tersambung dan menahan proses tetap
  // hidup; di test itu tidak ada gunanya, jadi dimatikan.
  klien.setHeartbeatAutoStart(false);
  const hasil = await klien.connect();

  assert.strictEqual(peripheral.duga.connectAsync, 1, 'harus menyambung sekali');
  assert.strictEqual(peripheral.duga.discover, 1, 'harus menemukan layanan');
  assert.strictEqual(peripheral.duga.subscribe, 1,
    'subscribe wajib: tanpa itu tidak ada paket masuk sama sekali');
  assert.strictEqual(klien.isConnected(), true);
  assert.strictEqual(hasil.deviceName, NAMA_PRINTER, 'nama printer ikut dilaporkan');
  assert.strictEqual(hasil.address, ALAMAT_PRINTER);
});

test('printer yang sudah dikenal TIDAK dipindai ulang', async () => {
  // noble menyimpan perangkat yang pernah terlihat. Memakai simpanan itu membuat
  // cetak berikutnya cepat dan, lebih penting, tidak memboroskan radio saat
  // printer sedang dipakai proses lain.
  const peripheral = buatPeripheralPalsu();
  const noble = buatNoblePalsu({ peripheral });
  const klien = new NiimbotNobleClient({ noble, nama: NAMA_PRINTER });

  const dapat = await klien.cariPerangkat();

  assert.strictEqual(dapat, peripheral, 'perangkat tersimpan harus langsung dipakai');
  assert.strictEqual(noble.catatan.startScanning, 0, 'tidak perlu memindai');
});

test('printer yang belum dikenal ditemukan lewat nama iklan, tanpa dialog', async () => {
  // Inti perbedaannya dengan Web Bluetooth: tidak ada requestDevice, tidak ada
  // popup. Kalau ini berubah, seluruh alasan transport ini ada ikut hilang.
  const peripheral = buatPeripheralPalsu();
  const noble = buatNoblePalsu({ peripheral });
  // Kosongkan simpanan supaya jalur pemindaian benar-benar diuji.
  noble._peripherals = {};
  const klien = new NiimbotNobleClient({ noble, nama: NAMA_PRINTER });

  const dapat = await klien.cariPerangkat();

  assert.strictEqual(dapat, peripheral, 'perangkat yang cocok harus ditemukan');
  assert.strictEqual(noble.catatan.startScanning, 1, 'memindai sekali');
  assert.ok(noble.catatan.stopScanning >= 1, 'pemindaian harus dihentikan');
  assert.strictEqual(noble.catatan.listeners, 0,
    'pendengar discover harus dilepas, kalau tidak ia menumpuk tiap sambungan');
});

test('paket masuk dari printer diteruskan ke pemroses protokol', async () => {
  // Titik sambung yang paling mudah salah: karakteristik benar, subscribe benar,
  // tetapi data tidak disalurkan — hasilnya cetak menggantung sampai timeout.
  const peripheral = buatPeripheralPalsu();
  const noble = buatNoblePalsu({ peripheral });
  const klien = new NiimbotNobleClient({ noble, nama: NAMA_PRINTER });

  const diterima = [];
  klien.processRawPacket = (data) => diterima.push(data);

  klien.setHeartbeatAutoStart(false);
  await klien.connect();
  const paket = Buffer.from([0x55, 0x55, 0x01]);
  peripheral.channel._onData(paket);

  assert.strictEqual(diterima.length, 1, 'data printer harus sampai ke pemroses');
  assert.strictEqual(diterima[0], paket);
});

test('sendRaw menulis Buffer TANPA respons (writeValueWithoutResponse)', async () => {
  const peripheral = buatPeripheralPalsu();
  const noble = buatNoblePalsu({ peripheral });
  const klien = new NiimbotNobleClient({ noble, nama: NAMA_PRINTER });
  klien.packetIntervalMs = 0;
  klien.setHeartbeatAutoStart(false);
  await klien.connect();

  await klien.sendRaw(Uint8Array.from([1, 2, 3]));

  assert.strictEqual(peripheral.duga.writes.length, 1, 'sekali tulis');
  const tulis = peripheral.duga.writes[0];
  assert.ok(Buffer.isBuffer(tulis.data), 'noble hanya menerima Buffer/TypedArray');
  assert.deepStrictEqual([...tulis.data], [1, 2, 3], 'isi paket tidak boleh diubah');
  assert.strictEqual(tulis.withoutResponse, true,
    'true = writeValueWithoutResponse; false akan menunggu balasan yang tidak datang');
});

test('pengiriman berurutan: dua paket tidak saling menimpa', async () => {
  // Printer menerima satu paket pada satu waktu. Menulis bersamaan membuat
  // paket saling menimpa dan header-nya tidak dikenali.
  const peripheral = buatPeripheralPalsu();
  const noble = buatNoblePalsu({ peripheral });
  const klien = new NiimbotNobleClient({ noble, nama: NAMA_PRINTER });
  klien.packetIntervalMs = 5;
  klien.setHeartbeatAutoStart(false);
  await klien.connect();

  const urutan = [];
  const asli = peripheral.channel.writeAsync;
  peripheral.channel.writeAsync = async (d, w) => {
    urutan.push('mulai');
    await new Promise((r) => setTimeout(r, 10));
    urutan.push('selesai');
    return asli.call(peripheral.channel, d, w);
  };

  await Promise.all([klien.sendRaw(Uint8Array.from([1])), klien.sendRaw(Uint8Array.from([2]))]);

  assert.deepStrictEqual(urutan, ['mulai', 'selesai', 'mulai', 'selesai'],
    'kiriman kedua harus menunggu yang pertama selesai');
});

test('adapter Bluetooth mati dilaporkan sebagai BLUETOOTH_UNAVAILABLE', async () => {
  // Di macOS inilah gejala izin OS belum diberikan. Pesannya harus menyebut
  // langkahnya, karena pesan "tidak ditemukan" akan menyesatkan.
  const noble = buatNoblePalsu({ state: 'poweredOff' });
  const klien = new NiimbotNobleClient({ noble, nama: NAMA_PRINTER });

  await assert.rejects(() => klien.cariPerangkat(), (error) => {
    assert.strictEqual(error.code, 'BLUETOOTH_UNAVAILABLE');
    assert.match(error.message, /Bluetooth/i);
    return true;
  });
});

test('printer tidak terlihat -> PRINTER_NOT_FOUND dengan kriterianya', async () => {
  const noble = buatNoblePalsu({ peripheral: null });
  const klien = new NiimbotNobleClient({ noble, nama: NAMA_PRINTER, cariTimeoutMs: 30 });

  await assert.rejects(() => klien.cariPerangkat(), (error) => {
    assert.strictEqual(error.code, 'PRINTER_NOT_FOUND');
    assert.match(error.message, new RegExp(NAMA_PRINTER), 'kriteria harus disebut agar bisa diperiksa');
    return true;
  });
});

test('karakteristik yang tidak cocok ditolak, bukan dipakai diam-diam', () => {
  // Karakteristik tanpa notify+writeWithoutResponse akan menyambung "berhasil"
  // tetapi tidak ada paket yang mengalir — kegagalan yang paling menyesatkan.
  const peripheral = buatPeripheralPalsu({ punyaChannel: false });
  const klien = new NiimbotNobleClient({ noble: buatNoblePalsu(), nama: NAMA_PRINTER });

  return assert.rejects(() => klien.pilihKarakteristik(peripheral), (error) => {
    assert.strictEqual(error.code, 'CHARACTERISTIC_NOT_FOUND');
    return true;
  });
});

test('disconnect merapikan sambungan supaya cetak berikutnya bersih', async () => {
  const peripheral = buatPeripheralPalsu();
  const klien = new NiimbotNobleClient({ noble: buatNoblePalsu({ peripheral }), nama: NAMA_PRINTER });
  klien.setHeartbeatAutoStart(false);
  await klien.connect();

  await klien.disconnect();

  assert.strictEqual(peripheral.duga.disconnectAsync, 1, 'perangkat harus diputus');
  assert.strictEqual(klien.isConnected(), false);
});

test('sendRaw tanpa sambungan ditolak terang-terangan', async () => {
  const klien = new NiimbotNobleClient({ noble: buatNoblePalsu(), nama: NAMA_PRINTER });
  await assert.rejects(() => klien.sendRaw(Uint8Array.from([1])), /Channel is closed/);
});

test('kiosk BARU (belum ada nama/alamat) tetap bisa menemukan printer', async () => {
  // Tanpa cabang ini, pemasangan pertama di kiosk mustahil: tidak ada nama
  // maupun alamat tersimpan, jadi tidak ada yang cocok dan pencarian selalu
  // berakhir PRINTER_NOT_FOUND.
  const printer = {
    address: 'aa:bb:cc:dd:ee:ff',
    advertisement: { localName: 'B1 Pro-I606032055', serviceUuids: [] },
  };
  const noble = buatNoblePalsu({ peripheral: null });
  noble._peripherals = {};
  noble.startScanningAsync = async () => { noble.catatan.startScanning += 1; setImmediate(() => noble._onDiscover(printer)); };

  const klien = new NiimbotNobleClient({ noble });   // TANPA nama, TANPA alamat
  const dapat = await klien.cariPerangkat();

  assert.strictEqual(dapat, printer, 'printer label pertama harus bisa ditemukan');
});

test('tanpa kriteria, perangkat NON-printer tidak ikut dipilih', async () => {
  // Memilih perangkat sembarangan lebih buruk daripada gagal: radio terpakai
  // untuk perangkat yang salah, sementara pesannya menyalahkan printer.
  const noble = buatNoblePalsu({ peripheral: null });
  noble._peripherals = {};
  const klien = new NiimbotNobleClient({ noble, cariTimeoutMs: 40 });
  assert.strictEqual(
    klien.cocok({ address: '11:11:11:11:11:11', advertisement: { localName: 'Speaker Bluetooth' } }),
    false, 'perangkat bernama lain bukan printer label');
  assert.strictEqual(
    klien.cocok({ address: '22:22:22:22:22:22', advertisement: { localName: '', serviceUuids: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] } }),
    true, 'yang mengiklankan service NIIMBOT tetap dikenali meski tanpa nama');
  const bukanPrinter = { address: '11:11:11:11:11:11', advertisement: { localName: '' } };

  assert.strictEqual(klien.cocok(bukanPrinter), false, 'perangkat tanpa nama bukan printer label');
});
