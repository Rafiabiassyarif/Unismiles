/**
 * Uji PERILAKU: print task ditentukan oleh MODEL yang dibaca printer.
 *
 * Kenapa ini ada: printer B1 Pro dulu menerima rangkaian perintah untuk model
 * B1 (bawaan), dan pustaka memetakan B1_PRO ke task BERBEDA — D110M_V4, dengan
 * perintah printStart dan ukuran halaman yang lain. Akibatnya cetak berakhir
 * "Timeout waiting response (waited for e4)" (e4 = 228 = In_PageEnd), dan panel
 * Admin melaporkannya sebagai "printer tidak terdeteksi".
 *
 * Yang diuji: keputusan pemilihan task, dengan model printer dimasukkan seperti
 * hasil negosiasi nyata. Yang SENGAJA TIDAK diuji: simulasi kabel/radio —
 * membuat balasan paket tiruan berarti mengarang protokol, dan itu justru bisa
 * lulus sambil salah. Bukti radio hanya sah dari mesin kiosk.
 */
const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { NiimbotNobleClient } = require('../src/niimbotNobleClient');
const { cetakHalaman } = require('../../unismiles-photobooth/electron/ble/cetakHalaman.cjs');
const { PrinterModel } = require('@mmote/niimbluelib');

const TRANSPORT = path.join(__dirname, '..', 'src', 'niimbotNobleClient.js');

/**
 * Klien dengan model printer sudah "terbaca" (seperti sesudah negosiasi), dan
 * pengiriman paket dicatat alih-alih dikirim ke radio.
 */
function klienDenganModel(modelId) {
  const klien = new NiimbotNobleClient({ noble: { state: 'poweredOn' }, nama: 'B1pro-i616' });
  klien.printerInfo.modelId = modelId;
  klien.peripheral = {};           // isConnected() -> true
  klien.channel = {};
  klien.heartbeatAutoStart = false;
  const catatan = { task: [] };
  const asli = klien.protocol.newPrintTask.bind(klien.protocol);
  klien.protocol.newPrintTask = (nama, opsi) => {
    catatan.task.push(nama);
    const task = asli(nama, opsi);
    // Jangan menyentuh radio: semua perintah dianggap dijawab printer.
    task.printInit = async () => {};
    task.printPage = async () => {};
    task.waitForFinished = async () => {};
    task.printEnd = async () => {};
    return task;
  };
  return { klien, catatan };
}

test('model B1 Pro -> cetak memakai task D110M_V4, bukan B1', async () => {
  const { klien, catatan } = klienDenganModel(4097);  // id B1_PRO

  await cetakHalaman({
    klien,
    halaman: { rowsData: [], cols: 576, rows: 1, pageColor: 0 },
    copies: 1,
    paperEnd: 'advance-and-separate',
  });

  assert.deepStrictEqual(catatan.task, ['D110M_V4'],
    'task harus dari model printer; B1 adalah model yang salah untuk B1 Pro');
  assert.strictEqual(klien.getModelMetadata()?.model, PrinterModel.B1_PRO);
});

test('model B1 (bukan Pro) tetap memakai task B1', async () => {
  // Perbaikan ini TIDAK boleh mengubah perilaku printer yang sudah benar.
  const { klien, catatan } = klienDenganModel(4096);  // id B1

  await cetakHalaman({
    klien,
    halaman: { rowsData: [], cols: 384, rows: 1, pageColor: 0 },
    copies: 1,
    paperEnd: 'advance-and-separate',
  });

  assert.deepStrictEqual(catatan.task, ['B1']);
});

test('model belum terbaca -> jatuh ke bawaan, bukan gagal', async () => {
  // Kiosk yang protokolnya belum terbaca harus tetap mencoba mencetak.
  const { klien, catatan } = klienDenganModel(undefined);

  await cetakHalaman({
    klien,
    halaman: { rowsData: [], cols: 576, rows: 1, pageColor: 0 },
    copies: 1,
    paperEnd: 'advance-and-separate',
  });

  assert.deepStrictEqual(catatan.task, ['B1'], 'bawaan dipakai sebagai jaring terakhir');
});

test('nilai dari pemanggil menang atas tebakan', async () => {
  // Kalau renderer sudah tahu task-nya, itu yang dipakai.
  const { klien, catatan } = klienDenganModel(4097);

  await cetakHalaman({
    klien,
    halaman: { rowsData: [], cols: 576, rows: 1, pageColor: 0 },
    copies: 1,
    model: 'D110M_V4',
    paperEnd: 'advance-and-separate',
  });

  assert.deepStrictEqual(catatan.task, ['D110M_V4']);
});

test('transport native benar-benar memanggil negosiasi protokol', () => {
  // Syarat agar model di atas terbaca sama sekali. Diperiksa di sumber karena
  // memanggilnya butuh printer nyata; tanpa ini seluruh perbaikan di atas tidak
  // pernah tercapai di lapangan.
  const isi = fs.readFileSync(TRANSPORT, 'utf8');
  const connect = isi.slice(isi.indexOf('async connect()'), isi.indexOf('async disconnect()'));
  assert.match(connect, /await this\.negotiateAndGetPrinterInfo\(\)/,
    'connect() harus menegosiasi protokol supaya printerInfo.modelId terisi');
});
