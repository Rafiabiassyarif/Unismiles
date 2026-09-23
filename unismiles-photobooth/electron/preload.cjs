/**
 * Jembatan renderer <-> proses utama.
 *
 * Renderer (UI photobooth) tidak punya akses Node. Yang dibuka di sini hanya
 * lima fungsi printer — sengaja sempit, supaya halaman web tidak bisa menyentuh
 * berkas, proses, atau perangkat lain.
 *
 * Nama fungsi dan bentuk datanya sengaja cocok dengan jalur Web Bluetooth, jadi
 * pemanggilnya di UI bisa memakai keduanya dengan cara yang sama:
 *   - sambung()  = pengganti navigator.bluetooth requestDevice/getDevices
 *   - cetak()    = pengganti client.sendRaw lewat Web Bluetooth
 */
const { contextBridge, ipcRenderer } = require('electron');

// exposeInMainWorld memasang di `window` (bukan `navigator`) — itulah satu-satunya
// tempat contextBridge bisa menaruh sesuatu. Pemanggilnya membaca dari globalThis.
contextBridge.exposeInMainWorld('kioskPrinter', {
  /** Selalu true di aplikasi desktop: transport native tidak butuh dukungan browser. */
  tersedia: () => ipcRenderer.invoke('printer:tersedia'),

  /** Sambung ke printer lewat Bluetooth native. Tanpa dialog, tanpa izin halaman. */
  sambung: (opsi = {}) => ipcRenderer.invoke('printer:sambung', opsi),

  /** Putuskan sambungan (dipakai saat keluar atau saat radio perlu dilepas). */
  terputus: () => ipcRenderer.invoke('printer:terputus'),

  /** Status sambungan sekarang. */
  status: () => ipcRenderer.invoke('printer:status'),

  /**
   * Cetak satu halaman yang sudah di-encode.
   * `halaman` = hasil ImageEncoder (rowsData, cols, rows, pageColor) — bentuk
   * yang sama dengan yang dikirim ke printer lewat Web Bluetooth.
   */
  cetak: (halaman, opsi = {}) => ipcRenderer.invoke('printer:cetak', { halaman, opsi }),
});
