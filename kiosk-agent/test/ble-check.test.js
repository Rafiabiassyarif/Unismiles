/**
 * Uji diagnosa BLE — TANPA radio.
 *
 * Skrip diagnosa ini akan dijalankan DI KIOSK, tempat saya tidak bisa hadir.
 * Kalau logikanya salah, kesimpulannya akan menyesatkan justru pada saat paling
 * dibutuhkan: yang terlihat hanya "printer tidak ditemukan" padahal sebabnya
 * bisa izin OS, adapter mati, atau printer yang sedang dipegang perangkat lain.
 *
 * Karena itu bagian pengambilan keputusannya dipisah dan diuji di sini.
 */
const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const { pesanUntukState, klasifikasiPerangkat, pilihKandidat, bacaArgumen } =
  require(path.join(__dirname, '..', 'scripts', 'ble-check.js'));

test('adapter siap -> diagnosa boleh lanjut', () => {
  const d = pesanUntukState('poweredOn');
  assert.strictEqual(d.lanjut, true);
});

test('poweredOff menyebut IZIN macOS, bukan hanya "Bluetooth mati"', () => {
  // Ini kesalahan diagnosa yang paling mahal: pada macOS, poweredOff paling
  // sering berarti izin belum diberikan. Pesan yang hanya berkata "nyalakan
  // Bluetooth" akan membuat orang mencari di tempat yang salah.
  const d = pesanUntukState('poweredOff');
  assert.strictEqual(d.lanjut, false);
  assert.match(d.pesan, /izin Bluetooth belum diberikan/i);
  assert.match(d.pesan, /Privacy & Security → Bluetooth/);
  assert.match(d.pesan, /Windows/);
});

test('unauthorized dibedakan dari poweredOff', () => {
  const d = pesanUntukState('unauthorized');
  assert.match(d.pesan, /DITOLAK/);
  assert.strictEqual(d.lanjut, false);
});

test('unsupported menyebut adapter BLE, bukan izin', () => {
  // Menyuruh orang mengurus izin padahal mesinnya tidak punya adapter BLE
  // adalah pengalihan yang membuang waktu.
  const d = pesanUntukState('unsupported');
  assert.match(d.pesan, /tidak punya adapter BLE/);
  assert.ok(!/izin/i.test(d.pesan), 'jangan menyebut izin kalau masalahnya perangkat keras');
});

test('keadaan unknown dijelaskan, tidak dibiarkan menggantung', () => {
  // macOS/Windows hanya melaporkan keadaan setelah izin ada, jadi 'unknown'
  // adalah keadaan yang WAJAR muncul — dan harus ada jalan keluarnya.
  const d = pesanUntukState(undefined);
  assert.strictEqual(d.lanjut, false);
  assert.match(d.pesan, /izin Bluetooth belum diberikan/);
});

test('printer label dikenali dari service NIIMBOT walau namanya kosong', () => {
  // Beberapa sistem tidak meneruskan nama iklan. Kalau hanya nama yang dipakai
  // untuk mengenali, printer yang benar akan dilaporkan "tidak ada".
  const k = klasifikasiPerangkat({
    address: 'aa:bb:cc:dd:ee:ff',
    advertisement: { localName: '', serviceUuids: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] },
  });
  assert.strictEqual(k.printerLabel, true);
  assert.match(k.alasan, /service NIIMBOT/);
});

test('printer label dikenali dari awalan model', () => {
  const k = klasifikasiPerangkat({ address: 'aa:bb:cc:dd:ee:01', advertisement: { localName: 'B1 Pro-I606032055' } });
  assert.strictEqual(k.printerLabel, true);
  assert.match(k.alasan, /awalan model/);
});

test('perangkat lain TIDAK dilabeli printer', () => {
  // Salah menandai membuat operator mengisi nama perangkat yang salah di Admin.
  const k = klasifikasiPerangkat({ address: '11:22:33:44:55:66', advertisement: { localName: 'Speaker Bluetooth' } });
  assert.strictEqual(k.printerLabel, false);
  assert.strictEqual(k.alasan, '');
});

test('kriteria persis dihitung walau nama tidak berawalan model', () => {
  // Kiosk bisa memakai nama printer yang tidak standar; kalau itu diisi
  // eksplisit, ia harus dikenali.
  const k = klasifikasiPerangkat(
    { address: 'aa:bb:cc:dd:ee:02', advertisement: { localName: 'Printer Kasir' } },
    { nama: 'Printer Kasir' });
  assert.strictEqual(k.printerLabel, true);
  assert.match(k.alasan, /sama dengan kriteria/);
});

test('kandidat terkuat dipilih berdasarkan sinyal', () => {
  // Dua printer label bisa terlihat sekaligus (mis. tetangga). Memilih yang
  // sinyalnya paling kuat jauh lebih mungkin benar daripada yang pertama terlihat.
  const daftar = [
    { nama: 'B1 Pro-jauh', printerLabel: true, rssi: -90 },
    { nama: 'B1 Pro-dekat', printerLabel: true, rssi: -45 },
    { nama: 'Speaker', printerLabel: false, rssi: -20 },
  ];
  assert.strictEqual(pilihKandidat(daftar).nama, 'B1 Pro-dekat');
});

test('tanpa kandidat printer, hasilnya null (bukan tebakan)', () => {
  assert.strictEqual(pilihKandidat([{ nama: 'Speaker', printerLabel: false, rssi: -20 }]), null);
});

test('argumen baris perintah dibaca benar', () => {
  const o = bacaArgumen(['--nama', 'B1 Pro-I606032055', '--detik', '20', '--sambung']);
  assert.strictEqual(o.nama, 'B1 Pro-I606032055');
  assert.strictEqual(o.detik, 20);
  assert.strictEqual(o.sambung, true);
  assert.strictEqual(bacaArgumen([]).detik, 12, 'ada bawaan yang masuk akal');
});
