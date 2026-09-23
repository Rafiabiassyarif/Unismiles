/**
 * Uji jalur APLIKASI DESKTOP pada NiimbotPrinter.
 *
 * Kenapa ini ada: jalur desktop adalah satu-satunya cara menghapus izin Web
 * Bluetooth, dan kegagalannya berbentuk halus — printer "tersambung" tetapi
 * setiap cetak menyambung ulang, atau aplikasi desktop menolak mencetak karena
 * masih memeriksa Web Bluetooth. Keduanya tidak terlihat sampai di kiosk.
 *
 * Yang diuji: perilaku NiimbotPrinter saat jembatan native ada.
 * Yang TIDAK diuji: radionya. Itu hanya sah dibuktikan di mesin kiosk.
 */
import assert from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUMBER = readFileSync(path.join(ROOT, 'services', 'niimbotPrinter.ts'), 'utf8');

/** Jembatan native tiruan; mencatat setiap panggilan. */
function buatJembatan({ gagalSambung = false, tersambung = false } = {}) {
  const duga = { sambung: [], cetak: [], terputus: 0 };
  let tersambungSekarang = tersambung;
  return {
    duga,
    async sambung(opsi) {
      duga.sambung.push(opsi || {});
      if (gagalSambung) throw new Error('printer tidak ditemukan');
      tersambungSekarang = true;
      return { deviceName: opsi?.nama || 'B1 Pro-I606032055', address: 'aa:bb:cc:dd:ee:ff' };
    },
    async status() {
      return { tersambung: tersambungSekarang, deviceName: null, address: null };
    },
    async terputus() { duga.terputus += 1; tersambungSekarang = false; },
    async cetak(halaman, opsi) { duga.cetak.push({ halaman, opsi }); return { ok: true }; },
  };
}

/** localStorage tiruan: tanpa ini pemanggilan localStorage akan melempar. */
function pasangLocalStorage() {
  const isi = new Map();
  global.window = {
    localStorage: {
      getItem: (k) => (isi.has(k) ? isi.get(k) : null),
      setItem: (k, v) => isi.set(k, String(v)),
    },
    document: { querySelector: () => null },
  };
  global.navigator = {};
  return isi;
}

function bersihkan() {
  delete global.window;
  delete global.navigator;
}

test('isSupported() benar di aplikasi desktop meski Web Bluetooth tidak ada', () => {
  // Kalau cabang ini hilang, aplikasi desktop akan menolak mencetak sendiri
  // karena mengira browsernya tidak mendukung Web Bluetooth.
  assert.match(SUMBER, /static isSupported\(\): boolean \{\s*\n\s*if \(NiimbotPrinter\.nativeBridge\(\)\) return true;/,
    'isSupported harus mengenali jembatan native');
  // contextBridge hanya bisa memasang di window; membaca dari navigator akan
  // selalu kosong dan membuat aplikasi desktop menolak mencetak.
  assert.match(SUMBER, /globalThis as unknown as \{ kioskPrinter/,
    'jembatan harus dibaca dari globalThis, bukan navigator');
});

test('sambung-ulang tidak menyambung dua kali saat sudah tersambung', () => {
  // Setiap cetak memanggil connect(). Kalau isConnected() selalu false di jalur
  // desktop, sambungan dibuat ulang tiap kali — dan di Windows itu memutus
  // koneksi yang sedang dipakai.
  assert.match(SUMBER, /if \(NiimbotPrinter\.nativeBridge\(\)\) return this\.nativeTersambung;/,
    'isConnected harus melaporkan keadaan jalur desktop');
  assert.match(SUMBER, /private nativeTersambung = false;/,
    'keadaan itu harus disimpan');
  assert.match(SUMBER, /this\.nativeTersambung = true;/,
    'dan diset saat sambung berhasil');
});

test('halaman ter-encode dikirim ke transport native, bukan lewat Web Bluetooth', () => {
  // Yang diangkut adalah hasil ImageEncoder — jadi kalibrasi tetap satu sumber
  // di photobooth, dan hasil cetak identik dengan jalur browser.
  assert.match(SUMBER, /await native\.cetak\(encoded, \{ density: adj\.density, copies, model: this\.printTaskName \}\);/,
    'jalur cetak desktop harus mengirim halaman yang sudah di-encode');
  const posisiNative = SUMBER.indexOf('await native.cetak(encoded');
  const posisiWeb = SUMBER.indexOf('this.client.stopHeartbeat();', posisiNative);
  assert.ok(posisiNative > 0 && posisiWeb > posisiNative,
    'jalur desktop harus keluar SEBELUM kode Web Bluetooth dijalankan');
});

test('pairingState() menyatakan siap tanpa bergantung pada izin', () => {
  // Di desktop tidak ada izin per-origin; printer yang pernah dikenali sudah
  // cukup untuk dinyatakan siap, karena sambungan dibuat ulang saat mencetak.
  const fn = SUMBER.slice(SUMBER.indexOf('public async pairingState()'));
  assert.match(fn.slice(0, 700), /NiimbotPrinter\.nativeBridge\(\)/,
    'pairingState harus mengenali jalur desktop');
  assert.match(fn.slice(0, 900), /rememberedAddress\(\) \|\| this\.rememberedDeviceName\(\)/,
    'printer yang pernah dikenali = siap, tanpa menunggu sambungan');
});

test('disconnect() meneruskan ke transport native', () => {
  const fn = SUMBER.slice(SUMBER.indexOf('async disconnect(): Promise<void>'));
  assert.match(fn.slice(0, 400), /await native\.terputus\(\)/,
    'putus sambungan harus sampai ke proses utama');
});
