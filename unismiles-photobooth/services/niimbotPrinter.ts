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
  /** 'fit' = jaga rasio (bingkai putih); 'stretch' = penuhi label. */
  fitMode: 'fit' | 'stretch';
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
export { labelSize, B1_PRO_PRINTHEAD_PX, LABEL_DPI } from './labelGeometry';
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

    return {
      deviceName: (info as { deviceName?: string } | undefined)?.deviceName || 'tidak diketahui',
      model: meta?.model || 'tidak diketahui',
      printTask: this.printTaskName,
      // Dari pengukuran di kertas, bukan dari tabel model — lihat catatan berkas.
      printheadPx: B1_PRO_PRINTHEAD_PX,
    };
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

    let dw = canvas.width;
    let dh = canvas.height;
    let dx = 0;
    let dy = Math.round(adj.offsetYPx);

    if (adj.fitMode === 'fit') {
      const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
      dw = Math.round(img.naturalWidth * scale);
      dh = Math.round(img.naturalHeight * scale);
      dx = Math.round((canvas.width - dw) / 2);
      dy += Math.round((canvas.height - dh) / 2);
    }

    ctx.drawImage(img, dx, dy, dw, dh);
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
