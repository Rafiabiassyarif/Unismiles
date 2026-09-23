/**
 * Aplikasi desktop UniSmiles Photobooth.
 *
 * KENAPA ADA
 *
 * Di browser, Web Bluetooth menyimpan izin per-ORIGIN dan per-PROFIL, dan izin itu
 * bisa hilang (data situs dibersihkan, profil berbeda, mode kiosk). Gejalanya:
 * pemilih perangkat muncul lagi padahal printer sudah pernah dipasangkan — dan
 * TIDAK ADA kode di halaman web yang bisa memaksanya bertahan. Itu juga sebabnya
 * cetak OTOMATIS tidak bisa memasang printer: jalur itu menunggu unggahan, jadi
 * gestur klik sudah kedaluwarsa saat tiba di titik pemasangan.
 *
 * Di proses utama Electron, Bluetooth diakses lewat adapter OS. Tidak ada origin,
 * tidak ada izin halaman, tidak ada pemilih perangkat, tidak ada gestur yang
 * harus dijaga. Printer dicari dari nama atau alamatnya. Izin yang tersisa hanya
 * izin OS, sekali, milik aplikasi.
 *
 * YANG SENGAJA TIDAK BERUBAH
 *
 * UI tetap dimuat dari https://photobooth.uniinside.net, jadi seluruh perbaikan
 * photobooth tetap sampai dengan sekali deploy — aplikasi ini hanya menambahkan
 * jalur Bluetooth native. Penyusunan gambar (geometri label, margin, kepekatan)
 * tetap di renderer: kalibrasi tidak boleh punya dua sumber.
 *
 * BERKAS INI .cjs, BUKAN .js
 *
 * package.json paket ini memakai "type": "module", jadi berkas .js diperlakukan
 * sebagai ES module dan `require` di dalamnya gagal saat dimuat. Electron memuat
 * proses utama sebagai CommonJS.
 */
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session } = require('electron');

/** UI produksi. Bisa ditimpa untuk uji lokal lewat PHOTOBOOTH_URL. */
const URL_UI = process.env.PHOTOBOOTH_URL || 'https://photobooth.uniinside.net';

/**
 * Transport dan jalur cetak diambil dari SALINAN di dalam app (electron/ble/),
 * bukan dari kiosk-agent lewat jalur relatif: jalur itu tidak ada di mesin kiosk
 * setelah aplikasi dipaketkan. Agar salinan tidak menyimpang, ada test yang
 * membandingkannya byte-per-byte dengan sumbernya.
 */
const { NiimbotNobleClient } = require('./ble/niimbotNobleClient.cjs');
const { cetakHalaman } = require('./ble/cetakHalaman.cjs');

/** noble dimuat malas: menyentuh radio saat start memperlambat dan bisa menggantung. */
function muatNoble() {
  return require('@stoprocent/noble');
}

let jendela = null;
let klien = null;

/** Waktu tunggu adapter dilaporkan siap; noble memakai 'unknown' saat masih dingin. */
const TUNGGU_ADAPTER_MS = 8000;

async function putuskan() {
  if (klien) {
    try { await klien.disconnect(); } catch { /* sudah terputus */ }
  }
  klien = null;
}

/**
 * Nama printer yang sudah dikenal, dari localStorage renderer.
 *
 * Renderer mengirimnya, alih-alih proses utama menyimpan sendiri: nilai yang
 * dipakai memilih printer harus SATU sumber dengan yang dilihat operator di
 * pengaturan. Dua tempat menyimpan berarti bisa berbeda, dan gejalanya adalah
 * printer yang salah dicetak.
 */
let namaPrinterDikenal = null;

/**
 * Sambung ke printer tanpa dialog apa pun.
 *
 * Kalau nama belum dikenal, transport mencari sendiri (service NIIMBOT atau
 * awalan model) — jalur yang sudah terbukti menyambung 1,8 detik pada kiosk
 * tanpa nama, tanpa alamat, dan tanpa izin.
 */
async function sambung({ nama, alamat } = {}) {
  if (klien && klien.isConnected()) {
    return { deviceName: klien.nama || namaPrinterDikenal, address: klien.alamat };
  }
  await putuskan();
  const target = nama || namaPrinterDikenal || null;
  klien = new NiimbotNobleClient({
    noble: muatNoble(),
    nama: target,
    alamat: alamat || null,
  });
  const hasil = await klien.connect();
  if (hasil?.deviceName) namaPrinterDikenal = hasil.deviceName;
  return { deviceName: hasil?.deviceName || target, address: hasil?.address || null };
}

/** Cetak halaman yang SUDAH di-encode renderer. Tanpa menyentuh gambar. */
async function cetak(halaman, opsi = {}) {
  if (!klien || !klien.isConnected()) {
    // Kiosk bisa kehilangan sambungan saat printer tidur. Menyambung ulang di
    // sini sah: tidak ada gestur yang perlu dijaga di aplikasi desktop.
    await sambung({});
  }
  return cetakHalaman({ klien, halaman, ...opsi });
}

function daftarkanIpc() {
  ipcMain.handle('printer:tersedia', () => true);
  ipcMain.handle('printer:sambung', (_e, opsi) => sambung(opsi || {}));
  ipcMain.handle('printer:terputus', async () => { await putuskan(); return { ok: true }; });
  ipcMain.handle('printer:status', () => ({
    tersambung: Boolean(klien && klien.isConnected()),
    deviceName: (klien && klien.nama) || namaPrinterDikenal,
    address: klien ? klien.alamat : null,
  }));
  ipcMain.handle('printer:cetak', (_e, { halaman, opsi }) => cetak(halaman, opsi || {}));

  /**
   * Keadaan adapter, untuk ditampilkan di pengaturan kiosk.
   *
   * Dilaporkan apa adanya — termasuk 'unknown' — supaya mode kegagalan yang
   * berbeda (radio mati vs izin belum diberikan) bisa dibedakan operator.
   */
  ipcMain.handle('printer:keadaan-adapter', async () => {
    const noble = muatNoble();
    const state = await new Promise((resolve) => {
      if (noble.state && noble.state !== 'unknown') return resolve(noble.state);
      const selesai = (s) => { clearTimeout(t); noble.removeListener('stateChange', selesai); resolve(s); };
      const t = setTimeout(() => resolve(noble.state || 'unknown'), TUNGGU_ADAPTER_MS);
      noble.on('stateChange', selesai);
    });
    return { state };
  });
}

function buatJendela() {
  jendela = new BrowserWindow({
    width: 1080,
    height: 1920,
    kiosk: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // Renderer tetap terisolasi: tidak ada Node di sana. Jalur Bluetooth
      // hanya lewat IPC, jadi halaman web tidak bisa menyentuh perangkat OS.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  jendela.loadURL(URL_UI);
  jendela.on('closed', () => { jendela = null; });
}

app.whenReady().then(() => {
  // Izin yang MEMANG dibutuhkan photobooth: kamera (dan mikrofon kalau dipakai).
  // Ini izin per-izin di dalam Electron, bukan izin Bluetooth — Bluetooth tidak
  // lagi lewat renderer sama sekali.
  const DIIZINKAN = new Set(['media', 'audioCapture', 'videoCapture']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(DIIZINKAN.has(permission));
  });

  daftarkanIpc();
  buatJendela();

  app.on('activate', () => { if (!jendela) buatJendela(); });
});

app.on('window-all-closed', () => {
  putuskan().finally(() => app.quit());
});
