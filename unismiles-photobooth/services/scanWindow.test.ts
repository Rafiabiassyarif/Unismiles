import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCAN_WINDOW_MS, SCAN_FRAME_GAP_MS, MAX_FRAMES_TO_SEND, TARGET_GOOD_FRAMES,
  GOOD_SHARPNESS, FAIR_SHARPNESS, SCREEN_BRIGHT_RATIO,
  remainingMs, isWindowOver, progressPercent, remainingSeconds,
  classifyFrame, countGoodFrames, scanHint,
  keepBestFrames, orderFramesForUpload,
  SCAN_GUIDE, guideFrameStyle, hasScreen, isFrameUsable,
  SCAN_READ_DELAY_MS,
} from './scanWindow.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const componentSource = fs.readFileSync(
  path.join(here, '..', 'components', 'PhotoBooth.tsx'), 'utf8'
);

const frame = (sharpness, brightRatio) => ({ sharpness, brightRatio });

/** Frame yang benar-benar memuat layar HP (terang) dan tajam. */
const screenFrame = (sharpness = GOOD_SHARPNESS) => frame(sharpness, SCREEN_BRIGHT_RATIO + 0.1);

test('jendela pemindaian 10-15 detik sesuai permintaan', () => {
  assert.ok(SCAN_WINDOW_MS >= 10_000 && SCAN_WINDOW_MS <= 15_000, `dapat ${SCAN_WINDOW_MS}`);
  assert.strictEqual(SCAN_WINDOW_MS, 15_000);
});

test('jeda antar frame cukup cepat agar terasa real-time', () => {
  assert.ok(SCAN_FRAME_GAP_MS > 0 && SCAN_FRAME_GAP_MS <= 1000, `dapat ${SCAN_FRAME_GAP_MS}`);
});

test('sisa waktu tidak pernah negatif', () => {
  assert.strictEqual(remainingMs(0), SCAN_WINDOW_MS);
  assert.strictEqual(remainingMs(5_000), 10_000);
  assert.strictEqual(remainingMs(SCAN_WINDOW_MS), 0);
  assert.strictEqual(remainingMs(SCAN_WINDOW_MS + 9_999), 0);
});

test('jendela dianggap habis tepat di batas, bukan sebelumnya', () => {
  assert.strictEqual(isWindowOver(SCAN_WINDOW_MS - 1), false);
  assert.strictEqual(isWindowOver(SCAN_WINDOW_MS), true);
  assert.strictEqual(isWindowOver(SCAN_WINDOW_MS + 1), true);
});

test('progres 0-100 dan detik tersisa wajar untuk ditampilkan', () => {
  assert.strictEqual(progressPercent(0), 0);
  assert.strictEqual(progressPercent(SCAN_WINDOW_MS / 2), 50);
  assert.strictEqual(progressPercent(SCAN_WINDOW_MS * 2), 100);
  assert.strictEqual(remainingSeconds(0), 15);
  assert.strictEqual(remainingSeconds(14_500), 1);
  assert.strictEqual(remainingSeconds(SCAN_WINDOW_MS), 0);
});

test('klasifikasi ketajaman sesuai kalibrasi OCR', () => {
  assert.strictEqual(classifyFrame(GOOD_SHARPNESS), 'good');
  assert.strictEqual(classifyFrame(FAIR_SHARPNESS), 'fair');
  assert.strictEqual(classifyFrame(FAIR_SHARPNESS - 1), 'poor');
  assert.strictEqual(classifyFrame(0), 'poor');
});

// Keluhan berulang: "ngescan cepat banget sedangkan ngatur posisi aja susah".
// Penyebabnya ada jalur keluar lebih awal dari loop pemindaian. Setiap jalan
// keluar selain waktu habis harus dihapus, jadi ini dijaga ketat.
test('tidak ada jalur keluar lebih awal di loop pemindaian', () => {
  assert.ok(
    !/shouldSubmit/.test(componentSource),
    'tidak boleh ada pemanggilan shouldSubmit di komponen'
  );
  assert.ok(
    !/while \(true\)/.test(componentSource),
    'loop harus dibatasi kondisi waktu, bukan while(true) dengan break lain'
  );
  assert.match(
    componentSource,
    /while \(remainingMs\(Date\.now\(\) - startedAt\) > 0\)/,
    'loop harus berjalan selama sisa jendela waktu masih ada'
  );
});

test('tidak ada fungsi pengiriman-dipercepat di kebijakan', () => {
  const policy = fs.readFileSync(path.join(here, 'scanWindow.ts'), 'utf8');
  assert.ok(
    !/export function shouldSubmit/.test(policy),
    'shouldSubmit sudah dihapus; jangan dikembalikan tanpa pengukuran di kiosk'
  );
});

test('pengunjung diberi jeda sebelum frame pertama diambil', () => {
  assert.ok(SCAN_READ_DELAY_MS >= 1000, `jeda minimal 1 detik, dapat ${SCAN_READ_DELAY_MS}`);
  assert.match(
    componentSource,
    /setTimeout\(r,\s*SCAN_READ_DELAY_MS\)/,
    'komponen harus memakai jeda dari SCAN_READ_DELAY_MS'
  );
});

test('frame ruangan tanpa bukti bayar bukan frame layak', () => {
  // Angka dari pengukuran kamera nyata.
  const ruangan = [frame(1955, 0.016), frame(1694, 0.018), frame(1707, 0.016)];
  assert.strictEqual(hasScreen(ruangan[0]), false);
  assert.strictEqual(countGoodFrames(ruangan), 0);
});

test('frame dengan layar HP terang dihitung layak', () => {
  assert.strictEqual(hasScreen(screenFrame()), true);
  assert.strictEqual(countGoodFrames([screenFrame(), screenFrame(900)]), TARGET_GOOD_FRAMES);
});

test('layar terlihat tapi terlalu buram belum layak', () => {
  assert.strictEqual(isFrameUsable(frame(50, 0.5)), false);
  assert.strictEqual(isFrameUsable(frame(150, 0.5)), true);
});

test('frame tanpa brightRatio tidak dianggap memuat layar', () => {
  assert.strictEqual(hasScreen({ sharpness: 5000 }), false);
  assert.strictEqual(hasScreen(null), false);
  assert.strictEqual(hasScreen(undefined), false);
});

test('hint membedakan layar belum terlihat dari gambar kurang tajam', () => {
  assert.match(scanHint(null, false), /Arahkan/i);
  assert.match(scanHint(screenFrame(), true), /Bagus|baca/i);
  assert.match(scanHint(screenFrame(150), true), /area scan/i);
  assert.match(scanHint(frame(150, 0.01), true), /[Ll]ayar HP belum terlihat/);
  assert.match(scanHint(screenFrame(50), true), /stabil|tajam/i);
});

test('hanya frame terbaik yang disimpan, tidak menumpuk', () => {
  let kept = [];
  for (let i = 0; i < 200; i += 1) kept = keepBestFrames(kept, frame(i, 0.5));
  assert.strictEqual(kept.length, MAX_FRAMES_TO_SEND);
  assert.strictEqual(kept[0].sharpness, 199, 'frame paling tajam harus dipertahankan');
  assert.ok(kept.every((f) => f.sharpness >= 194), 'yang tersisa harus yang terbaik');
});

test('frame terbaik dikirim lebih dulu', () => {
  const ordered = orderFramesForUpload([frame(10, 0.5), frame(900, 0.5), frame(300, 0.5)]);
  assert.deepStrictEqual(ordered.map((f) => f.sharpness), [900, 300, 10]);
});

test('daftar frame kosong tidak melempar error', () => {
  assert.deepStrictEqual(orderFramesForUpload([]), []);
  assert.strictEqual(keepBestFrames([], frame(5, 0.5)).length, 1);
  assert.strictEqual(countGoodFrames([]), 0);
  assert.strictEqual(countGoodFrames(null), 0);
});

test('bingkai panduan dihitung dari SCAN_GUIDE, tidak dikarang di JSX', () => {
  const style = guideFrameStyle();
  assert.strictEqual(style.width, `${SCAN_GUIDE.widthRatio * 100}%`);
  assert.strictEqual(style.height, `${SCAN_GUIDE.heightRatio * 100}%`);
});

test('bingkai panduan tetap di dalam area preview', () => {
  assert.ok(SCAN_GUIDE.widthRatio > 0 && SCAN_GUIDE.widthRatio < 1);
  assert.ok(SCAN_GUIDE.heightRatio > 0 && SCAN_GUIDE.heightRatio < 1);
});

test('bingkai panduan lebih tinggi daripada lebar (bentuk layar HP)', () => {
  assert.ok(SCAN_GUIDE.heightRatio > SCAN_GUIDE.widthRatio);
});
