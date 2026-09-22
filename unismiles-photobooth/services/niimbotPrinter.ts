/**
 * Cetak ke printer label NIIMBOT dari browser, memakai NiimBlueLib.
 *
 * Kenapa library ini, bukan driver sendiri:
 *   NiimBlueLib (`@mmote/niimbluelib`) adalah library resmi yang dipakai
 *   niimblue (MultiMote/niimblue) — client web NIIMBOT dengan 760+ bintang, MIT,
 *   dan dipelihara. Protokol NIIMBOT tidak didokumentasikan vendor; menerapkan
 *   ulang handshake, task print, dan pembentukan paket dari nol berarti
 *   memelihara protokol hasil reverse-engineering sendiri. Library ini sudah
 *   mengerjakannya, termasuk tabel model (`getPrintTaskType`) dan encoder
 *   gambar.
 *
 * SATU DEVIASI YANG DISENGAJA — lebar kepala cetak:
 *   NiimBlueLib menulis `printheadPixels: 567` untuk B1_PRO. Pengujian di kertas
 *   pada printer B1 Pro yang dipakai UniSmiles menunjukkan kolom 0-575 KELUAR dan
 *   kolom 576 ke atas TIDAK keluar (tanpa pesan error apa pun). Karena itu
 *   gambar dikunci ke 576 px di sini, bukan 567.
 *
 *   Ini bukan mengabaikan library: 567 dan 576 sama-sama "lebar yang dicetak",
 *   dan angka 576 berasal dari pengukuran langsung di perangkat yang dipakai,
 *   bukan dari tabel model. Selisih 9 px (~0,76 mm) cukup untuk memotong tepi
 *   label — jadi yang dipakai adalah angka yang terbukti.
 */

import { B1_PRO_PRINTHEAD_PX, printBox, type LabelSize } from './labelGeometry.ts';
import { ditherToBlackAndWhite, ONE_BIT_THRESHOLD } from './oneBitImage.ts';
import {
  ImageEncoder,
  PageColorType,
  instantiateClient,
  type NiimbotAbstractClient,
  type PrinterModelMeta,
  type PrintTaskName,
  type PrintDirection,
} from '@mmote/niimbluelib';

/**
 * Apa yang dilakukan printer pada akhir cetak.
 *
 *  'advance-and-separate' (bawaan) — printEnd memajukan kertas ke posisi
 *      pemisah berikutnya. Untuk label berjarak (dengan celah) ini memang yang
 *      diinginkan: label keluar, siap disobek, dan majunya berhenti tepat di
 *      celah label berikutnya.
 *
 *  'stop-at-printhead' — tanpa printEnd. Kertas BERHENTI di posisi kepala cetak
 *      dan tidak dimajukan lagi, jadi tidak ada kertas terbuang.
 *
 * PENTING — yang mencetak potong adalah PERANGKAT, bukan protokol. B1 Pro tidak
 * punya pemotong; labelnya terpisah di garis perforasi/celah. Perintah
 * "HalfCut" (0x5C) ada di protokol untuk model lain yang punya pisau, sudah
 * dicoba dan tidak menghasilkan potongan di seri B. Jadi kalau yang dimaksud
 * "langsung cut" adalah label langsung terlepas, itu urusan kertas yang
 * dipakai, bukan setelan.
 */
export type PaperEndMode = 'advance-and-separate' | 'stop-at-printhead';

export interface PrintAdjustments {
  /** Kecerahan foto, persen (100 = tidak diubah). */
  brightness: number;
  /** Kontras foto, persen. */
  contrast: number;
  /** Saturasi foto, persen (0 = hitam putih). */
  saturation: number;
  /** Kepekatan termal 1-5 (diteruskan ke printer lewat print task). */
  density: number;
  /** Geser vertikal gambar pada kertas, piksel. Positif = turun. */
  offsetYPx: number;
  /** Geser mendatar gambar pada kertas, piksel. Positif = kanan. */
  offsetXPx: number;
  /** Margin atas: mulai cetak setelah sekian piksel dari tepi atas label. */
  marginTopPx: number;
  /** Margin kanan: hentikan cetak sekian piksel sebelum tepi kanan label. */
  marginRightPx: number;
  /** Margin kiri. */
  marginLeftPx: number;
  /** Margin bawah. */
  marginBottomPx: number;
  /**
   * 'fit' = muat seluruh foto, sisa label jadi putih (ada bingkai).
   * 'cover' = penuhi label, rasio dijaga, kelebihan dipotong (tanpa bingkai).
   * 'stretch' = penuhi label dengan merusak rasio (gepeng).
   */
  fitMode: 'fit' | 'cover' | 'stretch';
  /**
   * Perilaku akhir cetak. Bawaan 'advance-and-separate' = perilaku lama yang
   * sudah terbukti (label keluar, berhenti di celah berikutnya).
   */
  paperEnd?: PaperEndMode;
}

export const DEFAULT_ADJUSTMENTS: PrintAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  density: 3,
  offsetYPx: 0,
  offsetXPx: 0,
  marginTopPx: 0,
  marginRightPx: 0,
  marginLeftPx: 0,
  marginBottomPx: 0,
  fitMode: 'fit',
  paperEnd: 'advance-and-separate',
};

/** Geometri label: dihitung di `labelGeometry.ts` supaya bisa diuji tanpa hardware. */
import { drawRect } from './labelGeometry.ts';
export { labelSize, labelMmFromPaperSize, drawRect, printBox, firstSlot, DEFAULT_LABEL_MM, B1_PRO_PRINTHEAD_PX, LABEL_DPI } from './labelGeometry.ts';
export type { LabelSize } from './labelGeometry.ts';

export type PrintStatus =
  | { state: 'idle' }
  | { state: 'connecting' }
  | { state: 'connected'; deviceName: string; model: string; printTask: string }
  | { state: 'printing'; page: number; total: number }
  | { state: 'error'; message: string };

export class NiimbotPrinter {
  private client: NiimbotAbstractClient | null = null;
  private printTaskName: PrintTaskName = 'B1';

  /** Apakah browser ini bisa memakai Web Bluetooth. */
  static isSupported(): boolean {
    // Diperiksa dari objek global, bukan lewat tipe: tipe DOM bawaan Proyek ini
    // tidak memuat Web Bluetooth, dan menambah dependensi tipe hanya untuk satu
    // pemeriksaan tidak sepadan.
    return typeof navigator !== 'undefined'
      && Boolean((navigator as unknown as { bluetooth?: unknown }).bluetooth);
  }

  isConnected(): boolean {
    return Boolean(this.client?.isConnected());
  }

  /**
   * Sambungkan ke printer.
   *
   * HARUS dipanggil dari interaksi pengguna langsung (klik tombol): Web
   * Bluetooth menolak `requestDevice()` di luar gestur pengguna. Ini juga alasan
   * sambungan tidak bisa dipulihkan otomatis setelah printer idle dan memutus
   * Bluetooth — pengguna perlu klik lagi.
   */
  async connect(): Promise<{ deviceName: string; model: string; printTask: string; printheadPx: number }> {
    if (!NiimbotPrinter.isSupported()) {
      throw new Error('Browser ini tidak mendukung Web Bluetooth. Pakai Chrome atau Edge.');
    }

    // Klien baru setiap sambungan: client lama memegang GATT yang sudah mati.
    if (this.client) {
      try { await this.client.disconnect(); } catch { /* sudah terputus */ }
    }
    this.client = instantiateClient('bluetooth');

    // SAMBUNG TANPA PEMILIH PERANGKAT.
    //
    // `requestDevice()` selalu membuka pemilih perangkat, dan itu tidak bisa
    // dilewati. `navigator.bluetooth.getDevices()` sebaliknya — hanya tersedia
    // untuk situs yang sudah diberi izin (izin tersimpan sejak pasangan pertama,
    // dan Chrome mempertahankannya), dan hanya mengembalikan perangkat yang
    // SUDAH pernah dipasangkan. Justru itu yang dibutuhkan kiosk: printer yang
    // sama setiap kali, tanpa ada yang memilih apa pun.
    //
    // getDevices() boleh dipanggil TANPA gestur pengguna karena tidak membuka
    // dialog; itu yang membuat cetak otomatis mungkin. Kalau ternyata tidak ada
    // perangkat tersimpan (pasangan pertama, atau izin dicabut), jalur pemilih
    // tetap dipakai — jadi perilakunya tidak pernah lebih buruk dari sebelumnya.
    const authorized = await this.findPairedDevice();
    if (authorized) {
      // Tipe dasar library hanya punya connect() tanpa argumen, sedangkan
      // implementasi Bluetooth menerima { authorizedDevice }. Jadi yang
      // disempitkan di sini adalah NILAI client-nya, bukan tipe library.
      const btClient = this.client as unknown as {
        connect(options?: { authorizedDevice?: unknown; usesTillItsAvailable?: boolean }): Promise<unknown>;
      };
      try {
        await btClient.connect({ authorizedDevice: authorized });
        return this.finishConnect();
      } catch {
        // Tersimpan tapi gagal (printer mati / di luar jangkauan). Dicoba sekali
        // lagi tanpa pemilih, supaya cetak otomatis tidak terhenti oleh dialog.
        try {
          await btClient.connect({ authorizedDevice: authorized, usesTillItsAvailable: true });
          return this.finishConnect();
        } catch {
          // Jatuh ke pemilih di bawah: paling tidak orangnya bisa memilih manual.
        }
      }
    }
    // JEDA PAKET: sengaja TIDAK diubah — dipakai bawaan library (10 ms).
    //
    // Sebelumnya di sini tertulis setPacketInterval(0): kirim tanpa jeda sama
    // sekali. BLE tidak sanggup untuk data sebesar satu halaman (714 paket,
    // ~59 KB), printer menerima potongan paket yang tidak lengkap, dan di konsol
    // muncul "Dropping invalid buffer 00 00 00 00" disertai label yang keluar
    // tidak penuh. Jeda ini bagian dari protokol, bukan angka yang bisa
    // dihilangkan untuk mempercepat cetak.

    await this.client.connect();
    return this.finishConnect();
  }

  /** Nama perangkat yang diingat, supaya tidak perlu memilih lagi. */
  private readonly REMEMBERED_DEVICE_KEY = 'unismiles.printer.deviceName';

  /** Nama yang dipakai terakhir kali, dibaca dari localStorage. */
  public rememberedDeviceName(): string | null {
    try {
      return window.localStorage.getItem(this.REMEMBERED_DEVICE_KEY);
    } catch {
      return null;
    }
  }

  private rememberDeviceName(name: string | undefined): void {
    if (!name) return;
    try {
      window.localStorage.setItem(this.REMEMBERED_DEVICE_KEY, name);
    } catch {
      // localStorage bisa dilarang (mode privat). Bukan alasan menggagalkan cetak.
    }
  }

  /**
   * Cari printer yang sudah dipasangkan, tanpa membuka pemilih.
   *
   * Diutamakan yang namanya sama dengan yang dipakai terakhir kali — di kiosk
   * biasanya hanya ada satu, tetapi kalau ada beberapa, printer yang benar harus
   * dipilih dengan pasti, bukan yang pertama kebetulan ditemukan.
   */
  private async findPairedDevice(): Promise<any | null> {
    const bt = (navigator as any).bluetooth;
    if (!bt) return null;
    if (typeof bt.getDevices !== 'function') return null;
    try {
      const devices = await bt.getDevices();
      if (!Array.isArray(devices) || devices.length === 0) return null;
      const remembered = this.rememberedDeviceName();
      if (remembered) {
        const cocok = devices.find((d: any) => d?.name === remembered);
        if (cocok) return cocok;
      }
      // Belum ada catatan: pakai yang namanya berawalan merek printer label.
      const kandidat = devices.find((d: any) => /^[A-Za-z]/.test(String(d?.name || '')));
      return kandidat || devices[0];
    } catch {
      return null;
    }
  }

  /** Bagian connect() setelah sambungan terbentuk. */
  private async finishConnect(): Promise<{ deviceName: string; model: string; printTask: string; printheadPx: number }> {
    const info = this.client!.getPrinterInfo();
    const meta = this.client.getModelMetadata();
    const detected = this.client.getPrintTaskType();
    if (detected) {
      this.printTaskName = detected;
    }

    const deviceName = (info as { deviceName?: string } | undefined)?.deviceName || 'tidak diketahui';
    this.rememberDeviceName(deviceName);

    // Laporkan ke Admin. Tidak di-await: status bukan alasan menunda cetak.
    void this.reportStatus('READY', { printerName: deviceName });

    return {
      deviceName,
      model: meta?.model || 'tidak diketahui',
      printTask: this.printTaskName,
      // Dari pengukuran di kertas, bukan dari tabel model — lihat catatan berkas.
      printheadPx: B1_PRO_PRINTHEAD_PX,
    };
  }

  /**
   * Laporkan status printer ke backend supaya panel Admin bisa menampilkannya.
   *
   * Hanya browser yang tahu status ini: printer label NIIMBOT tersambung lewat
   * Web Bluetooth di sini, dan tidak muncul sebagai printer sistem — jadi
   * kiosk-agent tidak bisa melaporkannya.
   *
   * Kegagalan pelaporan TIDAK boleh menggagalkan cetak: status hanya informasi
   * bagi Admin, sedangkan label yang tidak tercetak adalah kerugian nyata.
   */
  async reportStatus(
    status: 'READY' | 'OFFLINE' | 'ERROR' | 'UNKNOWN',
    details: { printerName?: string; paperStatus?: string; lastError?: string } = {},
  ): Promise<void> {
    const apiKey = readKioskApiKey();
    const baseUrl = readApiBaseUrl();
    if (!apiKey || !baseUrl) return;

    try {
      await fetch(`${baseUrl.replace(/\/$/, '')}/kiosk/printer-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          status,
          printer_name: details.printerName ?? null,
          paper_status: details.paperStatus ?? null,
          last_error: details.lastError ?? null,
        }),
      });
    } catch {
      // Sengaja ditelan: lihat catatan di atas.
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    try { await this.client.disconnect(); } catch { /* sudah terputus */ }
    this.client = null;
  }

  /**
   * Siapkan gambar siap-cetak dari sumber apa pun (data-URL atau URL).
   *
   * Dua hal yang dilakukan di sini dan tidak dilakukan driver mentah:
   *
   *  1. Pengaturan tampilan dari Admin diterapkan (brightness/contrast/saturasi).
   *     Tanpa ini, pengaturan Admin hanya tersimpan tanpa efek.
   *  2. Gambar diletakkan pada kanvas seukuran label. Mode 'fit' menjaga rasio
   *     dan mengisi sisanya dengan putih; mode 'stretch' memenuhi label apa
   *     adanya (bisa gepeng). Penting: saat mengisi latar putih, filter TIDAK
   *     boleh aktif — kalau aktif, brightness 100% pun ikut mengubah putih.
   */
  async prepareCanvas(
    source: string,
    size: LabelSize,
    adj: PrintAdjustments = DEFAULT_ADJUSTMENTS,
  ): Promise<HTMLCanvasElement> {
    // Diperiksa dengan pesan yang menyebut sebabnya.
    //
    // Kalau ukuran ini rusak, `canvas.width` menjadi 0 dan browser hanya
    // mengeluh "The source width is 0." saat getImageData — pesan yang tidak
    // menunjuk ke mana pun. Penyebab aslinya hampir selalu objek ukuran yang
    // memakai nama field berbeda (mis. `w_px` sebagai ganti `widthPx`), atau
    // ukuran kertas yang tidak terbaca. Lebih baik gagal di sini dengan kalimat
    // yang bisa ditindaklanjuti.
    const widthPx = Number(size?.widthPx);
    const heightPx = Number(size?.heightPx);
    if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) {
      throw new Error(
        `Ukuran label tidak sah (${widthPx} x ${heightPx} px). `
        + 'Pastikan ukuran kertas di Admin terbaca dan objek ukuran memakai '
        + 'field widthPx/heightPx dari labelSize().',
      );
    }

    const img = await loadImage(source);
    // Ukuran gambar nol (foto rusak atau gagal dimuat sebagian) akan membuat
    // seluruh kanvas menjadi tinta; tolak lebih awal.
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error('Gambar yang akan dicetak tidak punya ukuran yang sah.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    // willReadFrequently: kanvas ini digambar SEKALI lalu pikselnya dibaca untuk
    // pengubahan hitam-putih. Tanpa petunjuk ini, browser memindahkan kanvas
    // bolak-balik antara GPU dan memori utama, dan memperingatkan di konsol.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D tidak tersedia di browser ini.');

    // Latar putih dulu, tanpa filter.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Baru gambar fotonya, dengan pengaturan dari Admin.
    ctx.save();
    ctx.filter = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%)`;

    // Perhitungan dipindah ke drawRect() supaya bisa diuji tanpa canvas.
    const r = drawRect(adj.fitMode, canvas.width, canvas.height, img.naturalWidth, img.naturalHeight,
      adj.offsetYPx, adj.offsetXPx, adj.marginTopPx, adj.marginRightPx, adj.marginLeftPx, adj.marginBottomPx,
      // Batas keras: kertas label lebih lebar dari kepala cetak, jadi kotak
      // cetak tidak boleh melewatinya walau marginnya mengatakan lain.
      B1_PRO_PRINTHEAD_PX);
    // Dipotong ke bidang cetak: piksel di luar margin dibiarkan putih. Tanpa
    // langkah ini, margin tidak akan pernah terlihat — foto menutupi seluruh
    // kanvas, jadi tidak ada ruang kosong yang bisa muncul.
    ctx.beginPath();
    ctx.rect(r.clipX, r.clipY, r.clipW, r.clipH);
    ctx.clip();
    ctx.drawImage(img, r.dx, r.dy, r.dw, r.dh);
    ctx.restore();

    // WAJIB, dan dilakukan setelah filter: encoder NiimBlueLib mencetak setiap
    // piksel yang bukan putih murni sebagai tinta penuh
    // (`color !== 0xffffff` di image_encoder.js). Foto tidak punya piksel yang
    // persis putih, jadi tanpa langkah ini SELURUH label keluar hitam pekat.
    // Library tidak menyediakan dithering maupun ambang, jadi dihitung di sini.
    //
    // Diletakkan setelah filter supaya pengaturan terang/kontras dari Admin ikut
    // menentukan hasil hitam-putihnya — kalau sebelum, filter akan mengembalikan
    // nilai antara dan merusak hasil dithering.
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Bidang cetak yang sama dengan yang dipakai menggambar: dithering di luar
    // kotak hanya membuang waktu, dan menjaga perhitungan tinta tetap setara
    // dengan yang benar-benar keluar di kertas.
    const inkBox = printBox(canvas.width, canvas.height,
      adj.marginTopPx, adj.marginRightPx, adj.marginLeftPx, adj.marginBottomPx, B1_PRO_PRINTHEAD_PX,
      adj.offsetXPx, adj.offsetYPx);
    ditherToBlackAndWhite(imageData.data, canvas.width, canvas.height, ONE_BIT_THRESHOLD, inkBox);
    ctx.putImageData(imageData, 0, 0);

    return canvas;
  }

  /**
   * Cetak satu gambar.
   *
   * Alur mengikuti contoh resmi NiimBlueLib: encodeCanvas -> printInit ->
   * printPage -> waitForPageFinished -> waitForFinished -> printEnd.
   */
  async print(
    image: string,
    size: LabelSize,
    copies = 1,
    adj: PrintAdjustments = DEFAULT_ADJUSTMENTS,
    onProgress?: (page: number, total: number) => void,
  ): Promise<void> {
    if (!this.client) throw new Error('Printer belum tersambung.');
    if (!this.client.isConnected()) throw new Error('Sambungan printer terputus. Sambungkan ulang.');

    const canvas = await this.prepareCanvas(image, size, adj);
    const meta = this.client.getModelMetadata();
    const direction = (meta?.printDirection ?? 'top') as PrintDirection;

    // SingleColor = satu warna (hitam) pada label 1-bit. Itu yang dipakai
    // printer label termal biasa; DoubleColor hanya untuk model pita dua warna.
    const encoded = ImageEncoder.encodeCanvas(canvas, PageColorType.SingleColor, direction);

    // Heartbeat dimatikan selama mencetak: paketnya bisa mengganggu aliran data
    // gambar. Contoh resmi NiimBlueLib melakukan hal yang sama.
    this.client.stopHeartbeat();

    const task = this.client.protocol.newPrintTask(this.printTaskName, {
      totalPages: copies,
      density: adj.density,
      statusPollIntervalMs: 100,
      statusTimeoutMs: 15_000,
      // BATAS WAKTU KIRIM HALAMAN — diukur, bukan ditebak.
      //
      // Satu halaman 576x714 px menjadi 714 paket / ~59 KB (diukur dengan
      // PacketGenerator.writeImageData). Pada jeda paket bawaan library 10 ms
      // itu berarti 7,1 detik. Bawaan di sini cuma 10 detik, jadi satu halaman
      // hampir pasti habis waktunya di tengah — gejalanya di kertas adalah label
      // keluar TIDAK PENUH (mis. hanya 1/4 gambar), disertai
      // "Dropping invalid buffer" di konsol karena potongan paket yang tertunda
      // ikut terbaca sebagai paket baru.
      //
      // Diberi kelonggaran besar: BLE bisa melambat kalau ada perangkat lain,
      // dan gagal karena lambat jauh lebih murah daripada label setengah jadi.
      pageTimeoutMs: 60_000,
    });

    try {
      await task.printInit();
      for (let page = 1; page <= copies; page += 1) {
        await task.printPage(encoded, 1);
        await task.waitForPageFinished();
        onProgress?.(page, copies);
      }
      await task.waitForFinished();
    } finally {
      if (adj.paperEnd === 'stop-at-printhead') {
        // Sengaja TIDAK memanggil printEnd. Di seri B1, pageEnd sudah
        // menghentikan kertas di posisi kepala cetak; printEnd-lah yang
        // memajukannya lagi. Tanpa printEnd, kertas tidak maju — tidak ada
        // kertas terbuang. Konsekuensinya gambar berikutnya mulai dari posisi
        // yang sama, jadi ini untuk mencetak satu kali per lembar.
        //
        // Hati-hati: hati-hati jangan sampai ini jadi bawaan. Untuk kertas
        // berlabel (54x67 mm) yang punya desain tercetak, label berikutnya TIDAK
        // akan sampai ke posisi cetak kalau kertas tidak dimajukan.
        void task;
      } else {
        // printEnd WAJIB pada mode bawaan: itu yang mengeluarkan kertas sampai
        // berhenti di pemisah label berikutnya.
        try { await task.printEnd(); } catch { /* sudah selesai */ }
      }
      try { this.client.startHeartbeat(); } catch { /* opsional */ }
    }
  }
}

/** Muat gambar dari data-URL atau URL menjadi HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Gambar dari server lain butuh CORS agar tidak mengotori canvas.
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gambar tidak bisa dimuat.'));
    img.src = src;
  });
}


/**
 * Kunci API kiosk.
 *
 * Dibaca dari localStorage dengan kunci yang sama dipakai `storageService`, lalu
 * dari env build. Kalau tidak ada, pelaporan status dilewati — lebih baik tidak
 * ada status di Admin daripada mencetak dengan kredensial salah.
 */
function readKioskApiKey(): string {
  try {
    const direct = localStorage.getItem('unismiles_kiosk_api_key');
    if (direct) return direct.trim();
    const cfg = localStorage.getItem('unismiles_config');
    if (cfg) {
      const parsed = JSON.parse(cfg);
      if (parsed?.apiKey) return String(parsed.apiKey).trim();
    }
  } catch { /* localStorage bisa diblokir; perlakukan sebagai tidak ada */ }
  return String(import.meta.env.VITE_KIOSK_API_KEY || '').trim();
}

/** Base URL API backend. */
function readApiBaseUrl(): string {
  return String(import.meta.env.VITE_API_BASE_URL || '').trim();
}
