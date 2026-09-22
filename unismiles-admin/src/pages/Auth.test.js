/**
 * Pesan galat login masih diagnostik.
 *
 * Kenapa ini diuji: pesan lama ("Backend tidak dapat dihubungi. Periksa koneksi")
 * menyembunyikan alamat yang benar-benar dipanggil. Saat backend ternyata HIDUP
 * — dibuktikan dengan preflight 204 dan login 401 dari luar — pesan itu
 * mengarahkan pemeriksaan ke server, padahal masalahnya di tempat lain.
 * Pesan yang buruk membuat orang memeriksa hal yang salah.
 */

import assert from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./Auth.tsx', import.meta.url), 'utf8');

test('pesan galat menyebut ALAMAT yang dipanggil', () => {
  assert.match(SRC, /Alamat yang dipanggil/,
    'tanpa alamat, penyebab tidak bisa dibedakan dari luar');
  assert.match(SRC, /err\?\.config\?\.baseURL|err\.config\.baseURL/,
    'alamat harus diambil dari konfigurasi request, bukan ditulis manual');
});

test('pesan galat tidak lagi menyalahkan koneksi secara umum', () => {
  assert.doesNotMatch(SRC, /Periksa koneksi, lalu coba lagi/,
    'pesan lama mengarahkan pemeriksaan ke tempat yang salah');
});

test('disebutkan bahwa panel harus dibuka dari domain, bukan dev lokal', () => {
  // Penyebab paling sering: dibuka lewat vite dev (port 3001) yang mem-proxy ke
  // 127.0.0.1:8000, sedangkan backendnya tidak jalan di mesin ini.
  assert.match(SRC, /unismilees\.uniinside\.net/, 'arahkan ke alamat yang benar');
  assert.match(SRC, /dev lokal|localhost/i, 'sebutkan jebakan dev lokal');
});

test('kode galat jaringan ikut ditampilkan', () => {
  // ERR_NETWORK / ERR_CONNECTION_REFUSED membedakan 'tidak sampai' dari
  // 'sampai tapi ditolak' tanpa perlu membuka DevTools.
  assert.match(SRC, /err\?\.code/, 'kode galat jaringan harus ikut');
});

test('cabang pesan lain tidak ikut berubah', () => {
  for (const m of ['Email atau password tidak valid', 'Terlalu banyak percobaan login',
                   'Backend tidak merespons']) {
    assert.ok(SRC.includes(m), `cabang '${m}' harus tetap ada`);
  }
});
