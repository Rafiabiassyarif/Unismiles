/**
 * Uji PERILAKU alur pairing printer label.
 *
 * Kenapa berkas terpisah dari bluetoothPrint.test.js: berkas itu memeriksa teks
 * sumber, dan pemeriksaan teks tidak bisa membuktikan hal terpenting di sini —
 * bahwa pemilih perangkat BENAR-BENAR tidak dibuka. Berkas ini menjalankan
 * kodenya dengan `navigator.bluetooth` palsu, dan `requestDevice` dicatat:
 * kalau ia pernah dipanggil, itulah popup "wants to pair" yang dikeluhkan.
 *
 * Web Bluetooth disimulasikan, bukan diganti: yang diuji adalah KEPUTUSAN
 * kode kita (pakai perangkat tersimpan, atau minta izin), bukan browser.
 */

import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { NiimbotPrinter } from './niimbotPrinter.ts';

/** Perangkat palsu; hanya bentuk yang dibaca kode kita. */
const perangkat = (name: string) => ({ name, gatt: { connect: async () => { throw new Error('tidak dipakai di uji ini'); } } });

/** Pasang navigator.bluetooth palsu dan catat setiap pemanggilan pemilih. */
function pasangBluetooth({ devices = [] as any[], getDevicesGagal = false, adaBluetooth = true } = {}) {
  const catatan = { requestDevice: 0, getDevices: 0 };
  const bt = {
    async getDevices() {
      catatan.getDevices += 1;
      if (getDevicesGagal) throw new Error('izin dicabut');
      return devices;
    },
    async requestDevice() {
      catatan.requestDevice += 1;
      throw new Error('pemilih perangkat dibuka — inilah popup yang tidak boleh muncul');
    },
  };
  // `navigator` di Node hanya punya getter, jadi tidak bisa di-assign langsung.
  Object.defineProperty(globalThis, 'navigator', {
    value: adaBluetooth ? { bluetooth: bt } : {},
    configurable: true,
    writable: true,
  });
  return catatan;
}

beforeEach(() => {
  pasangBluetooth();
  if (!(globalThis as any).window) {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } },
      configurable: true, writable: true,
    });
  }
});

test('backend tidak didukung -> dinyatakan, bukan dicoba', async () => {
  pasangBluetooth({ adaBluetooth: false });
  assert.equal(await new NiimbotPrinter().pairingState(), 'unsupported');
});

test('belum ada printer tersimpan -> pairingState meminta dipasangkan', async () => {
  pasangBluetooth({ devices: [] });
  assert.equal(await new NiimbotPrinter().pairingState(), 'no-stored-device');
});

test('printer sudah tersimpan -> siap, tanpa dialog', async () => {
  const catatan = pasangBluetooth({ devices: [perangkat('B1pro-i616')] });
  const p = new NiimbotPrinter();
  assert.equal(await p.pairingState(), 'ready');
  assert.deepEqual(await p.storedDeviceNames(), ['B1pro-i616']);
  // Inti permintaannya: membaca izin tidak membuka pemilih.
  assert.equal(catatan.requestDevice, 0, 'membaca izin tidak boleh membuka pemilih');
});

test('getDevices gagal (izin dicabut) -> tetap tidak membuka pemilih', async () => {
  const catatan = pasangBluetooth({ getDevicesGagal: true });
  assert.equal(await new NiimbotPrinter().pairingState(), 'no-stored-device');
  assert.equal(catatan.requestDevice, 0, 'izin dicabut harus jadi galat, bukan dialog');
});

test('sambung awal saat izin belum ada TIDAK PERNAH membuka pemilih', async () => {
  // Ini yang membuat popup tidak muncul sendiri saat halaman dimuat: preconnect
  // berhenti lebih dulu, sebelum ada kesempatan memanggil pemilih.
  const catatan = pasangBluetooth({ devices: [] });
  const hasil = await new NiimbotPrinter().preconnectSilently();
  assert.equal(hasil, null);
  assert.equal(catatan.requestDevice, 0, 'preconnect tidak boleh membuka pemilih');
});

test('beberapa kali siapkan-halaman berturut-turut tetap tanpa pemilih', async () => {
  // Meniru reload halaman berulang dan cetak berulang: setiap instance baru
  // harus membaca izin yang sama dan tidak membuka dialog.
  const catatan = pasangBluetooth({ devices: [perangkat('B1pro-i616')] });
  for (let i = 0; i < 5; i += 1) {
    const p = new NiimbotPrinter();
    assert.equal(await p.pairingState(), 'ready', `putaran ${i}: harus siap`);
  }
  assert.equal(catatan.requestDevice, 0, 'berulang kali pun tidak boleh membuka pemilih');
  assert.equal(catatan.getDevices, 5, 'setiap putaran membaca dari browser, bukan dari cache basi');
});

test('printer tercatat tetapi browser tidak mengenalinya -> minta dipasangkan', async () => {
  // Keadaan paling menjebak: localStorage masih menyimpan nama printer, tetapi
  // izin untuk alamat ini tidak ada (dipasangkan dari alamat lain). Harus
  // dilaporkan sebagai belum siap, bukan diam-diam dicoba dan gagal.
  pasangBluetooth({ devices: [] });
  // Catatan nama ada (localStorage), tetapi browser tidak mengenali
  // perangkatnya. Dua sumber berbeda, dan yang menentukan adalah browser.
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => 'B1pro-i616', setItem: () => {}, removeItem: () => {} },
    configurable: true, writable: true,
  });
  assert.equal(await new NiimbotPrinter().pairingState(), 'no-stored-device');
});
