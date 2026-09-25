/**
 * Print task HARUS berasal dari model yang dibaca printer.
 *
 * Kenapa ini ada: printer B1 Pro mencetak lewat jalur Bluetooth native, dan
 * jalur itu dulu TIDAK menegosiasi protokol. Akibatnya model printer tidak
 * pernah dibaca, print task dipaksa 'B1' (bawaan), dan pustaka memetakan
 * B1_PRO ke task yang BERBEDA — D110M_V4, dengan perintah printStart dan
 * ukuran halaman yang lain. Yang terlihat di lapangan: cetak gagal dengan
 * "Error invoking remote method 'printer:cetak': Error: Timeout waiting
 * response (waited for e4)" — e4 = 228 = In_PageEnd, printer tidak menjawab
 * akhir halaman. Panel Admin menyebutnya "printer tidak terdeteksi", padahal
 * printernya tersambung dan yang salah rangkaian perintahnya.
 *
 * Yang diuji di sini: pemetaan model -> task dari pustaka, dan bahwa SEMUA
 * jalur cetak mengambil nilainya dari model — bukan dari sebuah konstanta.
 * Yang TIDAK diuji: radionya. Itu hanya sah dibuktikan di mesin kiosk.
 */
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const { PrinterModel } = require('@mmote/niimbluelib');
const printTasks = require('@mmote/niimbluelib/dist/cjs/print_tasks/index.js');

const CETAK_DESKTOP = path.join(REPO, 'unismiles-photobooth', 'electron', 'ble', 'cetakHalaman.cjs');
const TRANSPORT = path.join(REPO, 'kiosk-agent', 'src', 'niimbotNobleClient.js');
const ADAPTER = path.join(REPO, 'kiosk-agent', 'src', 'blePrinterAdapter.js');
const JEMBATAN_MAIN = path.join(REPO, 'unismiles-photobooth', 'electron', 'main.cjs');
const PRINTER = path.join(REPO, 'unismiles-photobooth', 'services', 'niimbotPrinter.ts');

const read = (p) => fs.readFileSync(p, 'utf8');

test('B1 Pro TIDAK memakai print task B1 — pustaka memetakannya ke D110M_V4', () => {
  // Ini alasan sebenarnya cetak gagal, dan kenapa 'B1' sebagai bawaan berbahaya.
  assert.strictEqual(printTasks.findPrintTask(PrinterModel.B1_PRO, 4), 'D110M_V4');
  assert.strictEqual(printTasks.findPrintTask(PrinterModel.B1_PRO, undefined), 'D110M_V4');
  // Dan B1 memang hanya untuk B1 (tanpa varian Pro).
  assert.strictEqual(printTasks.findPrintTask(PrinterModel.B1, undefined), 'B1');
  assert.ok(!printTasks.modelPrintTasks.B1.some((x) => (x.m || x) === PrinterModel.B1_PRO),
    'B1_PRO tidak boleh ada di daftar model task B1');
});

test('transport native menegosiasi protokol sebelum melaporkan tersambung', () => {
  const isi = read(TRANSPORT);
  const connect = isi.slice(isi.indexOf('async connect()'), isi.indexOf('async disconnect()'));
  assert.match(connect, /await this\.negotiateAndGetPrinterInfo\(\)/,
    'connect() harus menegosiasi protokol; tanpa itu model printer tidak terbaca');
  // Tanpa cleanup: argumen itu memutus Bluetooth saat negosiasi gagal, sehingga
  // kegagalan protokol menyamar sebagai kegagalan radio.
  assert.ok(!/negotiateAndGetPrinterInfo\(\(\) =>/.test(connect),
    'negosiasi tidak boleh memakai cleanup disconnect');
  assert.match(connect, /printTask: this\.getPrintTaskType\(\)/,
    'jenis print task harus ikut dilaporkan ke pemanggil');
  // Kegagalan negosiasi dicatat, bukan melempar keluar: sambungannya sehat.
  assert.match(connect, /catch \(error\)/,
    'kegagalan negosiasi tidak boleh menggagalkan sambungan');
});

test('transport native mengizinkan kata kunci protokol lewat ke kelas dasar', () => {
  // Kalau dispatch ini dilewati, negotiateAndGetPrinterInfo memanggil method
  // yang tidak ada dan sambungan gagal dengan galat yang menyesatkan.
  const isi = read(TRANSPORT);
  for (const method of ['negotiateAndGetPrinterInfo', 'getPrintTaskType']) {
    assert.match(isi, new RegExp(`this\\.${method}`),
      `transport harus memakai ${method} dari kelas dasar`);
  }
});

test('jalur cetak desktop TIDAK memaksa task B1', () => {
  const isi = read(CETAK_DESKTOP);
  assert.match(isi, /newPrintTask\(tugas, \{/,
    'cetakHalaman harus memakai task hasil deteksi, bukan konstanta');
  assert.ok(!/newPrintTask\(model \|\| MODEL_BAWAAN/.test(isi),
    'tidak boleh jatuh langsung ke bawaan tanpa mencoba model printer');
  // Bawaan tetap ada sebagai jaring terakhir, tetapi harus disebut sebagai
  // pilihan terakhir — bukan pilihan pertama.
  assert.match(isi, /getPrintTaskType/,
    'jenis task harus dicoba dibaca dari klien yang sudah bernegosiasi');
});

test('print task diteruskan dari proses utama ke renderer', () => {
  const main = read(JEMBATAN_MAIN);
  const sambung = main.slice(main.indexOf('async function sambung'), main.indexOf('async function cetak'));
  assert.match(sambung, /printTask: hasil\?\.printTask \|\| jenisPrintTask\(klien\)/,
    'proses utama harus meneruskan jenis print task ke renderer');
  // Renderer memilih print task saat encod/print; tanpa nilai ini ia memakai
  // bawaannya dan bug kembali.
  const printer = read(PRINTER);
  assert.match(printer, /if \(hasil\?\.printTask\) this\.printTaskName = hasil\.printTask/,
    'renderer harus memakai jenis task yang dilaporkan transport');
});

test('adapter kiosk-agent tidak mengirim nomor model ke newPrintTask', () => {
  const isi = read(ADAPTER);
  assert.ok(!/newPrintTask\(client\.printerInfo\?\.modelId/.test(isi),
    'modelId adalah angka; newPrintTask mencari nama task');
  assert.match(isi, /newPrintTask\(tugas, \{/,
    'adapter harus memakai jenis task dari model yang dibaca printer');
});

test('jalur desktop melaporkan READY supaya status galat lama hilang', () => {
  const printer = read(PRINTER);
  const connect = printer.slice(printer.indexOf('async connect('), printer.indexOf('async disconnect('));
  assert.match(connect, /void this\.reportStatus\('READY'/,
    'sambung berhasil di jalur desktop harus dilaporkan ke Admin');
});

test('nama printer tidak terhapus saat galat dilaporkan', () => {
  const printer = read(PRINTER);
  const fn = printer.slice(printer.indexOf('async reportStatus('));
  // Laporan galat datang tanpa nama printer; mengirim null membuat panel Admin
  // berubah dari "B1pro-i616" menjadi "—", persis saat keterangan itu dicari.
  assert.ok(!/printer_name: details\.printerName \?\? null/.test(fn),
    'nama printer tidak boleh dikosongkan oleh laporan galat');
  assert.match(fn, /details\.printerName \|\| this\.printDeviceName \|\| this\.rememberedDeviceName\(\)/,
    'nama yang sudah dikenal harus dipakai sebagai cadangan');
});
