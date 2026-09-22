/**
 * Hitung BERAPA PAKET yang benar-benar dikirim untuk satu halaman, dan berapa
 * lama pada beberapa jeda paket. Angka ini yang menentukan batas waktu kirim.
 *
 * Menebak di sini mahal harganya: batas waktu terlalu pendek membuat printer
 * berhenti di tengah halaman (label keluar separuh), dan gejalanya di kertas
 * mudah disalahartikan sebagai masalah printer.
 */
import { ImageEncoder, PageColorType, PacketGenerator } from '@mmote/niimbluelib';
import { ditherToBlackAndWhite } from './services/oneBitImage.ts';
import { labelSize, B1_PRO_PRINTHEAD_PX } from './services/labelGeometry.ts';

function fotoLebar(px: number, py: number) {
  const d = new Uint8ClampedArray(px * py * 4);
  for (let y = 0; y < py; y++) {
    for (let x = 0; x < px; x++) {
      const i = (y * px + x) * 4;
      const dx = x - px / 2, dy = y - py / 2;
      const r = Math.sqrt(dx * dx + dy * dy) / (px / 2);
      let v = r < 0.42 ? 205 : r < 0.55 ? 120 : y < py * 0.3 ? 70 : 160;
      if (r < 0.06) v = 245;
      // gradasi lembut supaya mirip foto sungguhan
      v = Math.max(0, Math.min(255, v + Math.round(12 * Math.sin(x / 7) * Math.cos(y / 9))));
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
  }
  return d;
}

const size = labelSize(54, 67);
console.log('ukuran label:', size.widthPx + 'x' + size.heightPx, 'px');
console.log('printheadPixels dari tabel library (567) vs yang dipakai saya (' + B1_PRO_PRINTHEAD_PX + ')');
console.log();

for (const ph of [567, B1_PRO_PRINTHEAD_PX]) {
  const data = fotoLebar(size.widthPx, size.heightPx);
  ditherToBlackAndWhite(data, size.widthPx, size.heightPx);
  const canvas = {
    width: size.widthPx, height: size.heightPx,
    getContext: () => ({ getImageData: () => ({ data, width: size.widthPx, height: size.heightPx }) }),
  } as unknown as HTMLCanvasElement;
  const enc = ImageEncoder.encodeCanvas(canvas, PageColorType.SingleColor, 'top');

  // Hitung paket seperti B1PrintTask.printPage -> writeImageData.
  let packets;
  try {
    packets = PacketGenerator.writeImageData(enc, { printheadPixels: ph });
  } catch (e) {
    console.log('printheadPixels=' + ph + ': GAGAL -> ' + e.message);
    continue;
  }

  const bytes = packets.reduce((n, p) => n + (p.toBytes ? p.toBytes().byteLength : 0), 0);
  const baris = enc.rowsData.filter(r => r.dataType === 'pixels').length;
  const voidBaris = enc.rowsData.filter(r => r.dataType === 'void').length;

  console.log('--- printheadPixels = ' + ph + ' ---');
  console.log('  enc.cols x enc.rows      :', enc.cols + 'x' + enc.rows);
  console.log('  baris piksel / baris kosong:', baris, '/', voidBaris);
  console.log('  JUMLAH PAKET gambar      :', packets.length);
  console.log('  total byte               :', bytes, '(' + (bytes / 1024).toFixed(1) + ' KB)');
  for (const jeda of [0, 4, 8, 10, 15, 20]) {
    const detik = (packets.length * jeda) / 1000;
    console.log('    jeda ' + String(jeda).padStart(2) + ' ms -> ' + detik.toFixed(1) + ' s kirim');
  }
  console.log();
}
