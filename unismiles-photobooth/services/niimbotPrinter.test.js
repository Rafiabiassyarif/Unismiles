/**
 * Test service cetak Niimbot.
 *
 * Yang diuji di sini adalah bagian yang TIDAK butuh printer fisik: geometri
 * label, pengaturan tampilan dari Admin, dan alur print task. Bagian yang butuh
 * hardware (Bluetooth, kertas) tidak bisa diuji otomatis dan memang tidak
 * diklaim lolos di sini.
 */

import assert from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVICE = readFileSync(path.join(here, '..', 'services', 'niimbotPrinter.ts'), 'utf8');
// Konstanta geometri dipisah ke labelGeometry.ts supaya bisa benar-benar
// dieksekusi di test tanpa dependensi library printer.
const GEOMETRY = readFileSync(path.join(here, '..', 'services', 'labelGeometry.ts'), 'utf8');

// Nilai-nilai ini juga dipakai test dari sisi lain (backend, halaman uji).
const PRINTHEAD_PX = 576;
const DPI = 300;
const px = (mm) => Math.round((mm / 25.4) * DPI);

test('lebar dikunci ke kepala cetak, memakai angka hasil pengukuran di kertas', () => {
  // NiimBlueLib menulis 567 untuk B1_PRO; pengukuran di unit yang dipakai
  // menunjukkan 576. Kalau seseorang "merapikan" angka ini agar cocok dengan
  // tabel library, tepi label akan terpotong ~0,76 mm tanpa error.
  assert.match(GEOMETRY, /export const B1_PRO_PRINTHEAD_PX = 576;/,
    'lebar kepala cetak harus 576 px (hasil pengukuran di kertas)');
  assert.ok(!/PRINTHEAD_PX = 567/.test(GEOMETRY + SERVICE),
    'jangan pakai 567 dari tabel library — itu bukan unit yang dipakai');
  // Service harus memakai konstanta itu, bukan menyalin angkanya.
  assert.match(SERVICE, /from '\.\/labelGeometry'/,
    'service harus mengimpor geometri, bukan mendefinisikan ulang');
});

test('geometri label dihitung oleh modul terpisah, bukan disalin di sini', () => {
  // Perhitungan lebar adalah penentu utama hasil cetak, jadi ia diuji dengan
  // MENJALANKAN kodenya di labelGeometry.test.ts — bukan dengan mencocokkan
  // teks di berkas ini.
  assert.match(SERVICE, /labelSize/, 'service harus memakai labelSize');
  assert.ok(!/Math\.min\(requested, printheadPx\)/.test(SERVICE),
    'perhitungan lebar tidak boleh diduplikasi di service');
});

test('pengaturan tampilan Admin dipakai, bukan diabaikan', () => {
  // Kalau nilai dari Admin hanya disimpan tanpa masuk ke filter canvas,
  // panel Admin akan terlihat berhasil tanpa mengubah hasil cetak.
  assert.match(SERVICE, /ctx\.filter = `brightness\(\$\{adj\.brightness\}%\) contrast\(\$\{adj\.contrast\}%\) saturate\(\$\{adj\.saturation\}%\)`/,
    'brightness/contrast/saturasi harus masuk ke filter canvas');
});

test('latar putih diisi TANPA filter aktif', () => {
  // Kalau filter aktif saat mengisi latar, brightness 100% pun mengubah putih
  // menjadi abu — dan pada printer 1-bit abu = hitam, jadi label jadi bertitik.
  const fillIdx = SERVICE.indexOf("ctx.fillStyle = '#ffffff'");
  const filterIdx = SERVICE.indexOf('ctx.filter =');
  assert.ok(fillIdx > 0 && filterIdx > fillIdx,
    'latar putih harus diisi lebih dulu, baru filter dipasang');
  assert.match(SERVICE, /ctx\.fillRect\(0, 0, canvas\.width, canvas\.height\);\n\n\s+\/\/ Baru gambar fotonya/,
    'pengisian latar harus selesai sebelum foto digambar');
});

test('perhitungan gambar ada di drawRect, bukan di dalam prepareCanvas', () => {
  // Perhitungannya SENGAJA dipindah ke labelGeometry.drawRect supaya bisa
  // dieksekusi di test nyata (labelGeometry.test.ts), bukan hanya dicocokkan
  // teksnya. Di sini yang diperiksa hanya bahwa prepareCanvas benar-benar
  // memakai hasilnya — bukan menghitung sendiri.
  assert.match(SERVICE, /drawRect\(adj\.fitMode, canvas\.width, canvas\.height, img\.naturalWidth, img\.naturalHeight, adj\.offsetYPx\)/,
    'prepareCanvas harus memakai drawRect');
  assert.match(SERVICE, /ctx\.drawImage\(img, r\.dx, r\.dy, r\.dw, r\.dh\)/,
    'menggambar memakai hasil drawRect');
  // Offset vertikal tidak boleh dihitung ulang di sini; itu tugas drawRect.
  assert.ok(!/let dy = Math\.round/.test(SERVICE),
    'perhitungan offset harus ada di drawRect saja, supaya tidak ada dua versi');
  // Default-nya harus fit: stretch bisa membuat foto gepeng tanpa disadari.
  assert.match(SERVICE, /fitMode: 'fit',/, 'bawaan harus fit');
});

test('tiga mode penyesuaian didukung', () => {
  assert.match(SERVICE, /fitMode: 'fit' \| 'cover' \| 'stretch'/, 'tipe harus mencakup cover');
  const geo = readFileSync(new URL('./labelGeometry.ts', import.meta.url), 'utf8');
  // cover = tanpa bingkai; fit = ada bingkai. Keduanya menjaga rasio.
  assert.match(geo, /mode === 'cover'[\s\S]{0,80}Math\.max\(/, 'cover memakai skala terbesar');
  assert.match(geo, /Math\.min\(/, 'fit memakai skala terkecil');
});

test('alur cetak mengikuti contoh resmi NiimBlueLib', () => {
  // Urutan ini dari contoh resmi library (example/main.js). Salah urutan
  // membuat printer tidak mengeluarkan label atau menggantung.
  const order = ['printInit', 'printPage', 'waitForPageFinished', 'waitForFinished'];
  let last = -1;
  for (const step of order) {
    const idx = SERVICE.indexOf(`task.${step}`);
    assert.ok(idx > last, `${step} harus dipanggil setelah langkah sebelumnya`);
    last = idx;
  }
  assert.match(SERVICE, /await task\.printEnd\(\)/, 'printEnd wajib: itu yang mengeluarkan kertas');
  assert.match(SERVICE, /finally \{[\s\S]{0,200}printEnd/,
    'printEnd harus di finally, supaya kertas tetap keluar walau ada error');
});

test('memakai API library, bukan protokol sendiri', () => {
  // Inti permintaan: jangan menerapkan ulang protokol NIIMBOT.
  assert.match(SERVICE, /from '@mmote\/niimbluelib'/, 'harus memakai NiimBlueLib');
  assert.match(SERVICE, /instantiateClient/, 'koneksi lewat factory library');
  assert.match(SERVICE, /ImageEncoder\.encodeCanvas/, 'encoding gambar lewat library');
  assert.match(SERVICE, /newPrintTask/, 'print task dari library');
  assert.match(SERVICE, /getPrintTaskType\(\)/, 'versi task dideteksi library, bukan ditulis tangan');
  assert.match(SERVICE, /getModelMetadata\(\)/, 'metadata model dari library');
  // Tidak ada implementasi paket/protokol sendiri.
  assert.ok(!/0x[A-Fa-f0-9]{2}\s*,\s*0x/.test(SERVICE), 'tidak boleh ada paket biner buatan sendiri');
});

test('Web Bluetooth diperiksa dari objek global, tanpa menambah dependensi tipe', () => {
  assert.match(SERVICE, /navigator as unknown as \{ bluetooth\?: unknown \}/,
    'pemeriksaan dukungan tidak boleh mengandalkan tipe DOM yang tidak ada');
});

test('kegagalan sambungan tidak menyisakan klien yang menggantung', () => {
  // Klien lama memegang GATT yang sudah mati. Kalau tidak dilepas, sambungan
  // berikutnya gagal dengan pesan yang membingungkan.
  assert.match(SERVICE, /if \(this\.client\) \{[\s\S]{0,120}await this\.client\.disconnect\(\)/,
    'klien lama harus diputus sebelum menyambung ulang');
  assert.match(SERVICE, /throw new Error\('Sambungan printer terputus\. Sambungkan ulang\.'\)/,
    'pesan harus memberi tahu pengguna apa yang harus dilakukan');
});

test('heartbeat dimatikan saat mencetak dan dinyalakan lagi', () => {
  // Paket heartbeat bisa mengganggu aliran data gambar; contoh resmi mematikannya.
  assert.match(SERVICE, /stopHeartbeat\(\)/, 'heartbeat harus dimatikan saat mencetak');
  assert.match(SERVICE, /startHeartbeat\(\)/, 'dan dinyalakan lagi setelah selesai');
});

test('gambar dari server lain dimuat dengan CORS', () => {
  // Tanpa ini canvas tercemar dan encodeCanvas gagal.
  assert.match(SERVICE, /img\.crossOrigin = 'anonymous'/, 'gambar non-data-URL butuh crossOrigin');
  assert.match(SERVICE, /src\.startsWith\('data:'\)/, 'data-URL tidak perlu crossOrigin');
});

test('dependensi tercatat di package.json', () => {
  const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies?.['@mmote/niimbluelib'],
    'NiimBlueLib harus jadi dependensi, bukan disalin ke repo');
  assert.match(pkg.dependencies['@mmote/niimbluelib'], /^\^?0\.4/,
    'versi 0.4x dipakai karena API print task stabil di sana');
});
