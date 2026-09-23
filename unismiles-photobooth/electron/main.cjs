/**
 * Aplikasi desktop UniSmiles Photobooth.
 *
 * KENAPA ADA
 *
 * Di browser, Web Bluetooth menyimpan izin per-ORIGIN dan per-PROFIL, dan izin itu
 * bisa hilang (data situs dibersihkan, profil berbeda, mode kiosk). Gejalanya:
 * pemilih perangkat muncul lagi padahal printer sudah pernah dipasangkan — dan
 * TIDAK ADA kode di halaman web yang bisa memaksanya bertahan.
 *
 * Di proses utama Electron, Bluetooth diakses lewat adapter OS. Tidak ada origin,
 * tidak ada izin halaman, tidak ada pemilih perangkat. Printer dicari dari nama
 * atau alamatnya. Izin yang tersisa hanya izin OS, sekali, milik aplikasi.
 *
 * YANG SENGAJA TIDAK BERUBAH
 *
 * UI tetap dimuat dari https://photobooth.uniinside.net, jadi seluruh perbaikan
 * photobooth tetap sampai dengan sekali deploy — aplikasi ini hanya menambahkan
 * jalur Bluetooth native. Penyusunan gambar (geometri label, margin, kepekatan)
 * tetap di renderer: kalibrasi tidak boleh punya dua sumber.
 */
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session } = require('electron');

/** UI produksi. Bisa ditimpa untuk uji lokal lewat PHOTOBOOTH_URL. */
const URL_UI = process.env.PHOTOBOOTH_URL || 'https://photobooth.uniinside.net';

/**
 * Transport + protokol diambil dari kiosk-agent supaya HANYA ADA SATU
 * implementasi. Menyalinnya ke sini berarti dua tempat yang harus dijaga sama —
 * dan perbaikan di salah satunya akan diam-diam tidak terpakai.
 *
 * ponytail: jalur relatif ini bekerja saat dijalankan dari repo. Sebelum
 * dipaketkan jadi installer, berkas transport harus di-vendor ke dalam app.
 */
const JALUR_AGENT = path.join(__dirname, '..', 'kiosk-agent', 'src');
const { NiimbotNobleClient } = require(path.join(JALUR_AGENT, 'niimbotNobleClient.js'));

let jendela = null;
let klien = null;
let noble = null;

/** noble dimuat malas: menyentuh radio saat start memperlambat dan bisa menggantung. */
function muatNoble() {
  if (!noble) noble = require(path.join(JALUR_AGENT, '..', 'node_modules', '@stoprocent', 'noble'));
  return noble;
}

async function putuskan() {
  if (klien) {
    try { await klien.disconnect(); } catch { /* sudah terputus */ }
  }
  klien = null;
}

/** Sambung ke printer tanpa dialog apa pun. */
async function sambung({ nama, alamat } = {}) {
  if (klien && klien.isConnected()) return { deviceName: klien.nama, address: klien.alamat };
  await putuskan();
  klien = new NiimbotNobleClient({ noble: muatNoble(), nama: nama || null, alamat: alamat || null });
  const hasil = await klien.connect();
  return { deviceName: hasil.deviceName, address: hasil.address };
}

/**
 * Cetak halaman yang SUDAH ter-encode.
 *
 * Renderer mengirim hasil ImageEncoder — jadi jalur ini tidak perlu tahu apa pun
 * soal gambar, margin, atau kepekatan. Yang diangkut hanya data cetak, dan itu
 * membuatnya identik dengan yang dicetak lewat browser.
 */
async function cetak(halaman, opsi = {}) {
  if (!klien || !klien.isConnected()) throw new Error('Printer belum tersambung.');
  const { density, copies = 1, model = 'B1' } = opsi;

  klien.stopHeartbeat();
  const task = klien.protocol.newPrintTask(model, {
    totalPages: copies,
    density,
    statusPollIntervalMs: 100,
    statusTimeoutMs: 15000,
    // Satu halaman 576x714 px = 714 paket (~59 KB). Pada jeda 10 ms itu ~7 detik,
    // jadi batas bawaan 10 detik hampir pasti habis di tengah dan label keluar
    // tidak penuh. Kelonggaran besar jauh lebih murah daripada label setengah jadi.
    pageTimeoutMs: 60000,
  });
  await task.printInit();
  await task.printPage(halaman, copies);
  if (typeof task.waitForPageFinished === 'function') await task.waitForPageFinished();
  await task.waitForFinished();
  await task.printEnd();
  return { ok: true };
}

function daftarkanIpc() {
  ipcMain.handle('printer:tersedia', () => true);
  ipcMain.handle('printer:sambung', (_e, opsi) => sambung(opsi || {}));
  ipcMain.handle('printer:terputus', async () => { await putuskan(); return { ok: true }; });
  ipcMain.handle('printer:status', () => ({
    tersambung: Boolean(klien && klien.isConnected()),
    deviceName: klien ? klien.nama : null,
    address: klien ? klien.alamat : null,
  }));
  ipcMain.handle('printer:cetak', (_e, { halaman, opsi }) => cetak(halaman, opsi || {}));
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
