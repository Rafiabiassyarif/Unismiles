/**
 * Adapter printer label NIIMBOT B1 Pro lewat Bluetooth native.
 *
 * KENAPA ADAPTER INI ADA
 *
 * Di photobooth, printer label dijangkau lewat Web Bluetooth — dan itu berarti
 * izin tersimpan per-ORIGIN per-PROFIL BROWSER, bisa hilang, dan tidak bisa
 * dipulihkan dari kode halaman. Di kiosk itu terlihat sebagai "harus izin lagi
 * setiap mau cetak". Gambar disusun di photobooth, tetapi printer dikendalikan
 * proses ini (agent), di mana Bluetooth diakses lewat adapter OS: tidak ada
 * origin, tidak ada izin halaman, dan printer dikenali dari ALAMAT/nama iklan.
 *
 * PEMBAGIAN TANGGUNG JAWAB (sengaja dijaga)
 *
 *   photobooth : menyusun gambar final (geometri label, margin, kepekatan) —
 *                setelan yang sudah dikalibrasi TIDAK dipindah ke sini.
 *   agent      : mengangkut gambar itu ke printer, 1:1, apa adanya.
 *
 * Jadi ukuran kertas hanya dicatat untuk log; yang menentukan hasil cetak tetap
 * gambar yang dikirim photobooth. Memindahkan geometri ke sini akan membuat
 * kalibrasi memiliki dua sumber — persis kelas bug yang sudah pernah terjadi.
 */
const niimbluelib = require('@mmote/niimbluelib');
const { PNG } = require('pngjs');
const { PrinterAdapter } = require('./printerAdapter');
const { NiimbotNobleClient } = require('./niimbotNobleClient');

const { ImageEncoder, CanvasImageSource, PageColorType } = niimbluelib;

/** Model dipakai untuk memilih print task. B1 Pro memakai task B1. */
const MODEL_BAWAAN = 'B1';

function galatBle(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * noble dimuat malas (lazy).
 *
 * `require('@stoprocent/noble')` menyentuh adapter Bluetooth saat dimuat, dan di
 * mesin tanpa Bluetooth itu bisa menggantung lama. Karena itu ia hanya dimuat
 * saat adapter ini benar-benar dipakai — proses agent tetap hidup normal kalau
 * Bluetooth tidak ada.
 */
function muatNoble() {
  return require('@stoprocent/noble');
}

class BlePrinterAdapter extends PrinterAdapter {
  /**
   * @param {object} config
   * @param {string} [config.printerName]    nama iklan, mis. "B1 Pro-I606032055"
   * @param {string} [config.printerAddress] alamat perangkat (lebih pasti di Windows)
   * @param {string} [config.printerModel]   model untuk print task, default 'B1'
   * @param {number} [config.density]        kepekatan 1-5 (default library: 2)
   * @param {number} [config.timeoutMs]
   * @param {number} [config.cariTimeoutMs]  batas waktu pencarian printer
   */
  constructor(config = {}) {
    super();
    this.printerName = config.printerName || null;
    this.printerAddress = config.printerAddress || null;
    this.printerModel = config.printerModel || MODEL_BAWAAN;
    this.density = Number(config.density) || undefined;
    this.timeoutMs = config.timeoutMs || 60000;
    this.cariTimeoutMs = config.cariTimeoutMs || 15000;
    /**
     * Batas pencarian saat PEMERIKSAAN STATUS saja (heartbeat), bukan saat mencetak.
     *
     * Saat mencetak, sabar itu benar: printer mungkin baru bangun dari tidur.
     * Saat heartbeat tiap 20 detik, sabar itu salah: printer yang memang mati
     * akan membuat agent memindai hampir tanpa jeda, dan itu memboroskan radio
     * yang sedang dipakai untuk hal lain.
     */
    this.statusCariTimeoutMs = config.statusCariTimeoutMs || 3000;
    this.paperSize = config.paperSize || null;
    this.client = null;
    /**
     * Pemuat noble, bisa ditimpa.
     *
     * noble menyentuh adapter Bluetooth saat dimuat dan, di mesin tanpa radio,
     * menyisakan pekerjaan tertunda yang menahan proses. Menyuntikkannya membuat
     * perilaku adapter bisa diuji tanpa efek samping itu — dan ini satu-satunya
     * tempat noble dimuat, jadi tidak ada jalan masuk lain yang lolos.
     */
    this.muatNoble = config.muatNoble || muatNoble;
    /**
     * Lama pemindaian saat MENDAFTAR printer (dipakai panel Admin).
     * Dipisah dari cariTimeoutMs karena tujuannya berbeda: di sini kita ingin
     * melihat apa saja yang ada, bukan menunggu satu perangkat tertentu.
     */
    this.durasiPindaiMs = Number(config.durasiPindaiMs) || 8000;
    /**
     * Cara menunggu adapter siap. Bisa ditimpa supaya perilakunya bisa diuji
     * tanpa radio, dan implementasi bawaan menunggu seperti transport.
     */
    this.tungguState = config.tungguState || null;
  }

  get configured() {
    return Boolean(this.printerName || this.printerAddress);
  }

  /** Klien noble, dibuat sekali lalu dipakai ulang supaya cetak berikutnya cepat. */
  async klien({ cariTimeoutMs } = {}) {
    if (this.client && this.client.isConnected()) return this.client;
    // Satu sambungan pada satu waktu. Tanpa penjaga ini, heartbeat dan pekerjaan
    // cetak bisa menyambung bersamaan — di Windows BLE hanya ada SATU koneksi
    // central aktif, jadi percobaan kedua justru merusak yang sedang berjalan.
    if (this.sedangMenyambung) return this.sedangMenyambung;
    if (!this.configured) {
      throw galatBle('Printer label belum dikonfigurasi (nama atau alamat belum diisi)', 'PRINTER_NOT_CONFIGURED');
    }
    this.sedangMenyambung = (async () => {
      const noble = this.muatNoble();
      if (this.client) {
        try { await this.client.disconnect(); } catch { /* sudah terputus */ }
      }
      this.client = new NiimbotNobleClient({
        noble,
        alamat: this.printerAddress,
        nama: this.printerName,
        cariTimeoutMs: cariTimeoutMs || this.cariTimeoutMs,
      });
      await this.client.connect();
      return this.client;
    })();
    try {
      return await this.sedangMenyambung;
    } finally {
      this.sedangMenyambung = null;
    }
  }

  async checkPrinter() {
    if (!this.configured) {
      return { exists: false, online: false, errorCode: 'PRINTER_NOT_CONFIGURED' };
    }
    try {
      // Batas pencarian lebih pendek untuk pemeriksaan status: ini dipanggil
      // heartbeat setiap 20 detik, dan memindai 15 detik tiap kali akan membuat
      // agent sibuk memindai terus-menerus ketika printer sedang mati.
      await this.klien({ cariTimeoutMs: this.statusCariTimeoutMs });
      return {
        exists: true,
        online: true,
        status: 'READY',
        printerName: this.client.nama || this.printerName || this.printerAddress,
      };
    } catch (error) {
      const kode = error.code === 'PRINTER_NOT_FOUND' ? 'PRINTER_NOT_FOUND'
        : error.code === 'BLUETOOTH_UNAVAILABLE' ? 'BLUETOOTH_UNAVAILABLE'
        : 'PRINTER_OFFLINE';
      return { exists: kode !== 'PRINTER_NOT_FOUND', online: false, errorCode: kode, reason: error.message };
    }
  }

  async getStatus() {
    const cek = await this.checkPrinter();
    if (cek.errorCode === 'PRINTER_NOT_CONFIGURED') return { status: 'NOT_CONFIGURED', errorCode: cek.errorCode };
    if (cek.errorCode === 'PRINTER_NOT_FOUND') return { status: 'NOT_FOUND', errorCode: cek.errorCode };
    if (cek.errorCode === 'BLUETOOTH_UNAVAILABLE') return { status: 'OFFLINE', errorCode: cek.errorCode };
    if (!cek.online) return { status: 'OFFLINE', errorCode: cek.errorCode };
    return { status: 'READY' };
  }

  /**
   * B1 Pro tidak melaporkan sisa kertas lewat API yang dipakai library.
   * Mengembalikan angka karangan akan lebih buruk daripada mengaku tidak tahu.
   */
  async getPaperStatus() {
    return { status: 'UNKNOWN', remaining: null };
  }

  /** Daftar printer label yang terlihat, untuk dipilih dari Admin. */
  async listPrinters() {
    const noble = this.muatNoble();
    // Keadaan bisa 'unknown' sesaat setelah proses dimuat; menunggu sebentar
    // lebih benar daripada melaporkan "tidak ada printer" pada kiosk yang baru
    // dinyalakan — tepat saat Admin membuka halaman untuk memasang printer.
    const state = typeof this.tungguState === 'function'
      ? await this.tungguState(noble)
      : noble.state;
    if (state !== 'poweredOn') return [];
    const terlihat = new Map();
    const onDiscover = (p) => {
      const nama = p.advertisement?.localName || '';
      if (!nama) return;
      terlihat.set(p.address || nama, { name: nama, address: p.address || null, status: 'UNKNOWN' });
    };
    noble.on('discover', onDiscover);
    try {
      await noble.startScanningAsync([], true);
      await new Promise((resolve) => setTimeout(resolve, this.durasiPindaiMs));
    } catch {
      return [];
    } finally {
      noble.removeListener('discover', onDiscover);
      await noble.stopScanningAsync().catch(() => {});
    }
    return Array.from(terlihat.values());
  }

  /**
   * Cetak satu gambar.
   *
   * Gambar dipakai APA ADANYA (1:1): photobooth sudah menyusun ukuran, margin,
   * dan kepekatan. Di sini hanya diubah menjadi data cetak lewat encoder library
   * yang sama, supaya hasilnya identik dengan jalur browser.
   */
  async printImage(filePath, options = {}) {
    const isi = await require('node:fs').promises.readFile(filePath);
    let png;
    try {
      png = PNG.sync.read(isi);
    } catch (error) {
      throw galatBle(`Gambar tidak bisa dibaca sebagai PNG: ${error.message}`, 'IMAGE_INVALID');
    }

    const client = await this.klien();

    // Lebar kepala cetak B1 Pro = 576 px. Lebih lebar dari itu akan terpotong
    // diam-diam, jadi ditolak terang-terangan.
    if (png.width > 576) {
      throw galatBle(`Lebar gambar ${png.width} px melebihi kepala cetak 576 px`, 'IMAGE_TOO_WIDE');
    }

    const source = new CanvasImageSource(
      { data: png.data, width: png.width, height: png.height }, png.width, png.height);
    const encoded = ImageEncoder.encode(source, PageColorType.SingleColor, 'top');

    const copies = Math.max(1, Number(options.copies) || 1);
    const task = client.protocol.newPrintTask(client.printerInfo?.modelId || this.printerModel, {
      totalPages: copies,
      ...(this.density ? { density: this.density } : {}),
      statusTimeoutMs: this.timeoutMs,
    });

    await task.printInit();
    await task.printPage(encoded, copies);
    if (typeof task.waitForPageFinished === 'function') await task.waitForPageFinished();
    await task.waitForFinished();
    // printEnd memajukan kertas sampai label keluar dari kepala cetak. B1 Pro
    // tidak punya pemotong, jadi ini langkah terakhir yang tersedia.
    await task.printEnd();

    return {
      accepted: true,
      requestId: `ble-${Date.now()}`,
      printerName: client.nama || this.printerName || this.printerAddress,
      pages: copies,
    };
  }

  async close() {
    if (this.client) {
      try { await this.client.disconnect(); } catch { /* sudah terputus */ }
    }
    this.client = null;
  }
}

module.exports = BlePrinterAdapter;
