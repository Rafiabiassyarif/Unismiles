/**
 * Test tombol "Cetak Bluetooth" di photobooth.
 *
 * Yang dijaga di sini adalah bahwa jalur cetak LANGSUNG benar-benar terpasang
 * dan tidak bergantung pada kiosk-agent maupun server:
 *
 *   photobooth -> Web Bluetooth -> NiimBlueLib -> NIIMBOT B1 Pro
 *
 * Kalau tombol ini sampai memanggil `queuePrintJob` (jalur server), artinya
 * fitur "tanpa agent" itu tidak benar-benar ada — photobooth akan tetap butuh
 * agent hidup, dan di kiosk yang agent-nya mati cetak akan gagal.
 *
 * Fungsi-fungsi yang bisa dijalankan (geometri label) diuji di
 * labelGeometry.test.ts; di sini yang diperiksa adalah sambungannya.
 */

import assert from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const BOOTH = readFileSync(path.join(ROOT, 'components', 'PhotoBooth.tsx'), 'utf8');

/** Ambil isi satu fungsi agar pemeriksaan tidak tersentuh kode lain. */
function bodyOf(name, source = BOOTH) {
  const start = source.indexOf(`const ${name} = async () => {`);
  assert.ok(start > 0, `${name} harus ada`);
  // Cari penutup sejajar dengan indentasi pembuka.
  const rest = source.slice(start);
  const end = rest.indexOf('\n  };');
  assert.ok(end > 0, `${name} harus punya penutup`);
  return rest.slice(0, end);
}

test('tombol cetak Bluetooth ada dan memanggil jalur langsung', () => {
  assert.match(BOOTH, /id="btn-bluetooth-print"/, 'tombol harus punya id stabil untuk diuji/diklik');
  assert.match(BOOTH, /onClick=\{\(\) => void handleBluetoothPrint\(\)\}/, 'tombol harus memanggil handler langsung');
  assert.match(BOOTH, /isBluetoothPrintAvailable\(\)/, 'tombol hanya tampil kalau browser mendukung Web Bluetooth');
});

test('jalur Bluetooth TIDAK lewat server atau agent', () => {
  const fn = bodyOf('handleBluetoothPrint');
  // Inti permintaan: tanpa kiosk agent. Kalau ada queuePrintJob / fetch print job
  // di sini, jalur ini kembali bergantung pada server.
  assert.ok(!/queuePrintJob/.test(fn), 'tidak boleh memakai queuePrintJob');
  assert.ok(!/getPrintJobStatus/.test(fn), 'tidak boleh menunggu status dari server');
  assert.ok(!/kioskAgentBridge/.test(fn), 'tidak boleh bergantung pada kiosk-agent');
  assert.ok(!/startPrintPolling/.test(fn), 'tidak boleh polling server');
  // Harus benar-benar memakai printer Bluetooth.
  assert.match(fn, /new NiimbotPrinter\(\)/, 'harus membuat klien printer sendiri');
  assert.match(fn, /\.connect\(\)/, 'harus menyambung printer');
  assert.match(fn, /printer\.print\(/, 'harus mencetak lewat printer langsung');
});

test('satu sambungan dipakai ulang, tidak menyambung tiap kali klik', () => {
  // Web Bluetooth menolak requestDevice di luar gestur pengguna, jadi
  // menyambung ulang tiap klik akan gagal setelah klik pertama.
  const fn = bodyOf('handleBluetoothPrint');
  assert.match(fn, /bluetoothPrinterRef\.current/, 'klien harus disimpan di ref');
  assert.match(fn, /if \(!printer\.isConnected\(\)\)/, 'hanya menyambung kalau belum tersambung');
});

test('batal memilih perangkat dibedakan dari kegagalan printer', () => {
  const fn = bodyOf('handleBluetoothPrint');
  assert.match(fn, /cancel\|user\|No device\|chooser/i,
    'pemilih yang ditutup harus dipesan sebagai bukan kegagalan printer');
  assert.match(fn, /Pemilih perangkat ditutup/,
    'pesannya harus memberi tahu apa yang harus dilakukan');
});

test('yang dicetak adalah FOTO, tanpa frame Admin', () => {
  const fn = bodyOf('handleBluetoothPrint');
  // Kertas label sudah ada desain tercetak. Menambahkan frame Admin di atasnya
  // membuat desain muncul dua kali, dan kanvas frame (mis. 708x1062) harus
  // diperkecil ke 576 px sehingga fotonya ikut menyusut dan menyisakan tepi.
  assert.match(fn, /capturedPhotos\[0\]/, 'pakai foto hasil jepretan');
  assert.ok(!/processedFrame|selectedFrame/.test(fn), 'frame Admin tidak boleh dipakai di jalur ini');
  // Jalur berframe tetap ada sebagai cadangan kalau foto tidak tersedia.
  assert.match(fn, /finalUploadedUrl/, 'ada cadangan');
  assert.match(fn, /generateCompositeImage\(\)/, 'cadangan terakhir');
});

test('pengaturan Admin dipakai di jalur Bluetooth', () => {
  const fn = bodyOf('handleBluetoothPrint');
  // Ukuran kertas dari Admin -> ukuran label.
  assert.match(fn, /labelMmFromPaperSize\(kioskPaperSize\)/,
    'ukuran label harus mengikuti ukuran kertas Admin');
  // Penyesuaian tampilan + kalibrasi termal.
  assert.match(fn, /\.\.\.photoAdjust/, 'brightness/contrast/saturasi/fit dari Admin harus dipakai');
  assert.match(fn, /density: Number\(thermalDensity\)/, 'kepekatan dari Admin harus dipakai');
  assert.match(fn, /offsetYPx: Number\(thermalOffsetYPx\)/, 'geser vertikal dari Admin harus dipakai');
});

test('kalibrasi termal datang dari agent, jadi Admin benar-benar berpengaruh', () => {
  // Tanpa langganan ini, kepekatan dan geser selalu nilai netral dan pengaturan
  // Admin terlihat tersimpan tanpa efek.
  assert.match(BOOTH, /setThermalDensity\(num\(agentState\.thermalDensity, 3\)\)/,
    'kepekatan harus dibaca dari laporan agent');
  assert.match(BOOTH, /setThermalOffsetYPx\(num\(agentState\.thermalOffsetYPx, 0\)\)/,
    'geser vertikal harus dibaca dari laporan agent');
  assert.match(BOOTH, /setKioskPaperSize\(agentState\.paperSize\)/,
    'ukuran kertas harus dibaca dari laporan agent');
});

test('status printer dilaporkan ke Admin supaya panel tidak kosong', () => {
  const fn = bodyOf('handleBluetoothPrint');
  assert.match(fn, /reportStatus\('READY'/, 'sambungan berhasil harus dilaporkan');
  assert.match(fn, /reportStatus\('ERROR'/, 'kegagalan harus dilaporkan');
  // Pelaporan tidak boleh menggagalkan cetak.
  assert.match(fn, /void .*reportStatus/, 'pelaporan tidak boleh di-await di jalur cetak');
});

test('tombol terkunci saat sambungan/cetak berlangsung', () => {
  // Mencegah dua cetakan fisik dari klik ganda.
  assert.match(BOOTH, /disabled=\{[^}]*btPrintState === 'connecting'[^}]*btPrintState === 'printing'/,
    'tombol harus terkunci selama proses');
  assert.match(BOOTH, /id="bluetooth-print-status"/, 'harus ada status yang terlihat');
});

test('jalur cetak lama tetap ada, tidak digantikan', () => {
  // Fitur ini TAMBAHAN. Menghapus jalur lama akan memutus kiosk yang memang
  // memakai printer sistem lewat agent.
  assert.match(BOOTH, /const handleManualPrint = async/, 'cetak manual harus tetap ada');
  assert.match(BOOTH, /const handleAutoPrint = async/, 'cetak otomatis lewat agent harus tetap ada');
  assert.match(BOOTH, /queuePrintJob\(/, 'jalur server harus tetap ada');
  assert.match(BOOTH, /id="btn-print"/, 'tombol print utama harus tetap ada');
});
