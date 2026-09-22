import { labelSize, printBox, drawRect, B1_PRO_PRINTHEAD_PX } from './services/labelGeometry.ts';
const PPMM = 576 / 48.7717;        // px/mm fisik (bukti: 0,5 cm Anda = 59 px)
const mm = (px: number) => (px / PPMM).toFixed(2);

const S = labelSize(54, 67);
console.log('kanvas (label 54x67) : ' + S.widthPx + 'x' + S.heightPx + ' px = ' + mm(S.widthPx) + 'x' + mm(S.heightPx) + ' mm');
console.log('kepala cetak         : ' + B1_PRO_PRINTHEAD_PX + ' px = ' + mm(B1_PRO_PRINTHEAD_PX) + ' mm');
console.log('skala                : ' + (S.widthPx / 54).toFixed(3) + ' px/mm  (fisik ' + PPMM.toFixed(3) + ')');
console.log();

const px = (m: number) => Math.round(m * PPMM);
const box = printBox(S.widthPx, S.heightPx, px(6), px(3), px(3), px(14), B1_PRO_PRINTHEAD_PX);
console.log('kotak cetak (margin atas 6, kanan 3, kiri 3, bawah 14):');
console.log('  x=' + box.x + ' y=' + box.y + '  ' + box.w + 'x' + box.h + ' px');
console.log('  = ' + mm(box.x) + ' mm dari kiri, ' + mm(box.y) + ' mm dari atas');
console.log('  ukuran area cetak: ' + mm(box.w) + ' x ' + mm(box.h) + ' mm   (target 46 x 46)');
console.log('  tepi kanan kotak : ' + (box.x + box.w) + ' px  (kepala cetak ' + B1_PRO_PRINTHEAD_PX + ')');
console.log();

const r = drawRect('cover', S.widthPx, S.heightPx, 628, 782, 0, 0, px(6), px(3), px(3), px(14), B1_PRO_PRINTHEAD_PX);
const masuk = r.dx <= box.x + 1 && r.dy <= box.y + 1 &&
  r.dx + r.dw >= box.x + box.w - 1 && r.dy + r.dh >= box.y + box.h - 1;
console.log('foto mengisi kotak tanpa melimpah: ' + masuk);
console.log('  gambar x ' + r.dx + '..' + (r.dx + r.dw) + '  kotak x ' + box.x + '..' + (box.x + box.w));
console.log('  gambar y ' + r.dy + '..' + (r.dy + r.dh) + '  kotak y ' + box.y + '..' + (box.y + box.h));
