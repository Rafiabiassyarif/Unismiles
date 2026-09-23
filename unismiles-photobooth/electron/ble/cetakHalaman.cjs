/**
 * Cetak satu halaman ter-encode ke printer label lewat Bluetooth native.
 *
 * KENAPA BERKAS INI ADA (bukan memakai BlePrinterAdapter kiosk-agent)
 *
 * BlePrinterAdapter menerima JALUR BERKAS lalu mendekode PNG-nya sendiri
 * (pngjs). Aplikasi desktop tidak punya berkas: renderer photobooth sudah
 * menyusun dan meng-encode gambar, lalu mengirim hasilnya lewat IPC. Menyalin
 * adapter ke sini akan menyeret jalur berkas, pngjs, dan PrinterAdapter yang
 * tidak dipakai — jadi yang diambil hanya bagian cetaknya.
 *
 * Urutan cetaknya SENGAJA identik dengan kiosk-agent/src/blePrinterAdapter.js:
 * itu urutan yang sudah mencetak label nyata di printer, dan urutan yang berbeda
 * akan terlihat sebagai "gambar terpotong" atau "label tidak maju".
 *
 * Yang TIDAK dipindah ke sini: geometri label, margin, dan kepekatan. Semua itu
 * tetap disusun photobooth di renderer, supaya kalibrasi punya SATU sumber.
 */
const { ImageEncoder, PageColorType } = require('@mmote/niimbluelib');

/** Model untuk memilih print task. B1 Pro memakai task B1. */
const MODEL_BAWAAN = 'B1';

/**
 * Cetak halaman yang sudah di-encode.
 *
 * @param {object} opsi
 * @param {import('@mmote/niimbluelib').NiimbotAbstractClient} opsi.klien klien yang SUDAH tersambung
 * @param {object} opsi.halaman hasil ImageEncoder (rowsData, cols, rows, pageColor)
 * @param {number} [opsi.copies]
 * @param {number} [opsi.density]
 * @param {string} [opsi.model]
 * @param {Function} [opsi.onProgress]
 */
async function cetakHalaman({ klien, halaman, copies = 1, density, model, onProgress }) {
  if (!klien || !klien.isConnected()) throw new Error('Printer belum tersambung.');

  const jumlah = Math.max(1, Number(copies) || 1);

  // Heartbeat dimatikan selama mencetak: paketnya bisa mengganggu aliran data
  // gambar. Contoh resmi NiimBlueLib melakukan hal yang sama.
  if (typeof klien.stopHeartbeat === 'function') klien.stopHeartbeat();

  // Batas waktu kirim halaman diukur dari ukuran nyata: satu halaman 576x714 px
  // = 714 paket (~59 KB), dan pada jeda paket bawaan 10 ms itu sekitar 7 detik.
  // Batas bawaan 10 detik hampir pasti habis di tengah, dan gejalanya di kertas
  // adalah label keluar TIDAK PENUH. Kelonggaran besar jauh lebih murah
  // daripada label setengah jadi.
  const task = klien.protocol.newPrintTask(model || MODEL_BAWAAN, {
    totalPages: jumlah,
    ...(density ? { density } : {}),
    statusPollIntervalMs: 100,
    statusTimeoutMs: 15000,
    pageTimeoutMs: 60000,
  });

  await task.printInit();
  for (let halamanKe = 1; halamanKe <= jumlah; halamanKe += 1) {
    await task.printPage(halaman, 1);
    if (typeof task.waitForPageFinished === 'function') await task.waitForPageFinished();
    onProgress?.(halamanKe, jumlah);
  }
  await task.waitForFinished();
  // printEnd memajukan kertas sampai label keluar dari kepala cetak. B1 Pro
  // tidak punya pemotong, jadi ini langkah terakhir yang tersedia.
  await task.printEnd();

  return { ok: true, pages: jumlah };
}

module.exports = { cetakHalaman, MODEL_BAWAAN };
