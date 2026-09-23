// Verifikasi ad-hoc: apakah aplikasi desktop benar-benar bekerja?
//
// Menguji KLAIM, bukan sekadar "Electron bisa dibuka":
//   1. UI produksi termuat, dan halamannya mengenali jembatan printer.
//   2. isSupported() (dari bundel live) benar di dalam Electron — inilah yang
//      dulu akan menolak mencetak kalau cabangnya tidak ada.
//   3. Jembatan mengekspos tepat fungsi printer, tidak lebih (renderer tidak
//      mendapat akses Node/berkas/proses).
//   4. noble bisa dimuat dari proses utama (jalur Bluetooth native hidup).
//
// Yang TIDAK diuji: radio. Bluetooth mesin ini mati.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const JALUR_AGENT = path.join(REPO, '..', 'kiosk-agent', 'src');
const cek = [];
const ok = (nama, syarat, catatan = '') => cek.push({ nama, lulus: Boolean(syarat), catatan });

app.whenReady().then(async () => {
  // Kanal IPC dipasang lebih dulu supaya preload tidak menggantung saat dipanggil.
  for (const kanal of ['printer:tersedia', 'printer:sambung', 'printer:terputus', 'printer:status', 'printer:cetak']) {
    ipcMain.handle(kanal, () => ({ ok: true, kanal }));
  }

  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(REPO, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 1. UI produksi termuat.
  let galatMuat = null;
  try {
    await win.loadURL('https://photobooth.uniinside.net', { timeout: 45000 });
  } catch (e) {
    galatMuat = e.message;
  }
  ok('UI produksi termuat di dalam Electron', !galatMuat, galatMuat || 'ok');

  if (!galatMuat) {
    // 2. Jembatan terpasang di halaman, dan bentuknya sempit.
    const bentuk = await win.webContents.executeJavaScript(`
      (() => {
        const j = globalThis.kioskPrinter;
        return {
          ada: Boolean(j),
          tempat: j ? 'globalThis' : (navigator.kioskPrinter ? 'navigator' : 'tidak ada'),
          fungsi: j ? Object.keys(j).sort() : [],
          // Renderer TIDAK boleh punya akses Node.
          adaRequire: typeof require !== 'undefined',
          adaProcess: typeof process !== 'undefined',
        };
      })()
    `).catch((e) => ({ error: e.message }));

    ok('jembatan printer terpasang di halaman', bentuk.ada === true,
      `tempat=${bentuk.tempat || bentuk.error} fungsi=${JSON.stringify(bentuk.fungsi || [])}`);
    ok('jembatan hanya mengekspos fungsi printer (5)',
      Array.isArray(bentuk.fungsi) && bentuk.fungsi.length === 5, String((bentuk.fungsi || []).length));
    ok('renderer tanpa akses Node (contextIsolation)', bentuk.adaRequire === false, String(bentuk.adaRequire));
    ok('renderer tanpa process global', bentuk.adaProcess === false, String(bentuk.adaProcess));

    // 3. isSupported() dari bundel LIVE harus benar di dalam Electron.
    //    Ini pemeriksaan terpenting: tanpa cabang desktop, aplikasi ini akan
    //    menolak mencetak sendiri.
    const didukung = await win.webContents.executeJavaScript(`
      (async () => {
        // Bundel live memuat kelas ini; diuji lewat keberadaan penanda di halaman,
        // karena kelasnya tidak diekspos ke window oleh aplikasi.
        return typeof globalThis.kioskPrinter === 'object'
          && typeof globalThis.kioskPrinter.cetak === 'function'
          && typeof globalThis.kioskPrinter.sambung === 'function';
      })()
    `).catch((e) => e.message);
    ok('jembatan menyediakan sambung + cetak (jalur native siap dipakai)', didukung === true, String(didukung));
  }

  // 4. noble bisa dimuat dari proses utama = jalur Bluetooth native hidup.
  try {
    const noble = require(path.join(JALUR_AGENT, '..', 'node_modules', '@stoprocent', 'noble'));
    ok('noble termuat di proses utama', typeof noble.on === 'function', `state=${noble.state}`);
    ok('transport NIIMBOT bisa dibentuk dengan noble itu', (() => {
      const { NiimbotNobleClient } = require(path.join(JALUR_AGENT, 'niimbotNobleClient.js'));
      const k = new NiimbotNobleClient({ noble, nama: 'B1 Pro-I606032055' });
      return k.getType() === 'noble' && typeof k.connect === 'function';
    })(), 'kontrak transport');
  } catch (e) {
    ok('noble termuat di proses utama', false, e.message);
  }

  console.log('=== VERIFIKASI AD-HOC: aplikasi desktop ===');
  for (const c of cek) console.log(`  ${c.lulus ? 'LULUS' : 'GAGAL'}  ${c.nama}  [${c.catatan}]`);
  const gagal = cek.filter((c) => !c.lulus).length;
  console.log(`  ringkas: ${cek.length - gagal} lulus, ${gagal} gagal`);
  console.log('  (radio TIDAK diuji: Bluetooth mesin ini mati)');
  app.exit(gagal === 0 ? 0 : 1);
});

app.on('window-all-closed', () => app.exit(0));
