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

import { B1_PRO_PRINTHEAD_PX, type LabelSize } from './labelGeometry';
import {
  ImageEncoder,
  PageColorType,
  instantiateClient,
  type NiimbotAbstractClient,
  type PrinterModelMeta,
  type PrintTaskName,
  type PrintDirection,
} from '@mmote/niimbluelib';

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
  /**
   * 'fit' = muat seluruh foto, sisa label jadi putih (ada bingkai).
   * 'cover' = penuhi label, rasio dijaga, kelebihan dipotong (tanpa bingkai).
   * 'stretch' = penuhi label dengan merusak rasio (gepeng).
   */
  fitMode: 'fit' | 'cover' | 'stretch';
}

export const DEFAULT_ADJUSTMENTS: PrintAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  density: 3,
  offsetYPx: 0,
  fitMode: 'fit',
};

/** Geometri label: dihitung di `labelGeometry.ts` supaya bisa diuji tanpa hardware. */
import { drawRect } from './labelGeometry';
export { labelSize, labelMmFromPaperSize, drawRect, DEFAULT_LABEL_MM, B1_PRO_PRINTHEAD_PX, LABEL_DPI } from './labelGeometry';
export type { LabelSize } from './labelGeometry';

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
    this.client.setPacketInterval(0);

    await this.client.connect();

    const info = this.client.getPrinterInfo();
    const meta = this.client.getModelMetadata();
    const detected = this.client.getPrintTaskType();
    if (detected) {
      this.printTaskName = detected;
    }

    const deviceName = (info as { deviceName?: string } | undefined)?.deviceName || 'tidak diketahui';

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
    const img = await loadImage(source);

    const canvas = document.createElement('canvas');
    canvas.width = size.widthPx;
    canvas.height = size.heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D tidak tersedia di browser ini.');

    // Latar putih dulu, tanpa filter.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Baru gambar fotonya, dengan pengaturan dari Admin.
    ctx.save();
    ctx.filter = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%)`;

    // Perhitungan dipindah ke drawRect() supaya bisa diuji tanpa canvas.
    const r = drawRect(adj.fitMode, canvas.width, canvas.height, img.naturalWidth, img.naturalHeight, adj.offsetYPx);
    ctx.drawImage(img, r.dx, r.dy, r.dw, r.dh);
    ctx.restore();

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
      // printEnd WAJIB: itu yang mengeluarkan kertas. Tanpa ini printer
      // berhenti dengan label masih di dalam.
      try { await task.printEnd(); } catch { /* sudah selesai */ }
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
