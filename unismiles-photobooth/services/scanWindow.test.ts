import assert from 'node:assert';
import { test } from 'node:test';
import {
  SCAN_WINDOW_MS, SCAN_FRAME_GAP_MS, MAX_FRAMES_TO_SEND, TARGET_GOOD_FRAMES,
  GOOD_SHARPNESS, FAIR_SHARPNESS,
  remainingMs, isWindowOver, progressPercent, remainingSeconds,
  classifyFrame, countGoodFrames, scanHint, shouldSubmit,
  keepBestFrames, orderFramesForUpload,
  SCAN_GUIDE, guideFrameStyle, SCREEN_BRIGHT_RATIO, hasScreen, isFrameUsable,
} from './scanWindow.ts';

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

// Bagian paling berisiko: berhenti terlalu cepat membuat pengunjung kehilangan
// kesempatan, padahal permintaannya justru "jangan terburu-buru".
test('jangan pernah mengirim frame sebelum ada frame sama sekali', () => {
  assert.strictEqual(shouldSubmit([], 0), false);
  assert.strictEqual(shouldSubmit([], SCAN_WINDOW_MS), false);
  assert.strictEqual(shouldSubmit(null, 0), false);
});

test('frame buram TIDAK memicu pengiriman dini', () => {
  const blurry = [screenFrame(40), screenFrame(80), screenFrame(100)];
  assert.strictEqual(shouldSubmit(blurry, 1_000), false, 'harus tetap menunggu');
  assert.strictEqual(shouldSubmit(blurry, SCAN_WINDOW_MS - 1), false);
});

// Keluhan nyata: "kok cepat banget ngescannya padahal tidak ada bukti bayar".
// Penyebabnya ketajaman saja dipakai untuk mempercepat, padahal ruangan penuh
// tekstur bernilai ketajaman LEBIH TINGGI daripada struk (diukur: ruangan
// 1694-1955, struk 590). Jadi frame tanpa bukti bayar justru dianggap "jelas".
test('frame ruangan tanpa bukti bayar TIDAK mempercepat pemindaian', () => {
  const ruangan = [
    frame(1955, 0.016),  // diukur: kamera menghadap ruangan
    frame(1694, 0.018),
    frame(1707, 0.016),
  ];
  assert.strictEqual(hasScreen(ruangan[0]), false, 'ruangan bukan layar HP');
  assert.strictEqual(countGoodFrames(ruangan), 0, 'tidak ada frame yang layak');
  assert.strictEqual(
    shouldSubmit(ruangan, 1_500), false,
    'pemindaian harus tetap berjalan sampai jendela waktu habis'
  );
});

test('frame dengan layar HP terang mempercepat pemindaian', () => {
  const layar = [screenFrame(), screenFrame(GOOD_SHARPNESS + 50)];
  assert.strictEqual(hasScreen(layar[0]), true);
  assert.strictEqual(countGoodFrames(layar), TARGET_GOOD_FRAMES);
  assert.strictEqual(shouldSubmit(layar, 1_200), true);
});

test('layar terlihat tapi gambar terlalu buram belum layak', () => {
  // Layar terang tapi sangat buram: jangan dianggap siap.
  assert.strictEqual(isFrameUsable(frame(50, 0.5)), false);
  assert.strictEqual(isFrameUsable(frame(150, 0.5)), true);
});

test('frame tanpa brightRatio tidak dianggap memuat layar', () => {
  assert.strictEqual(hasScreen({ sharpness: 5000 }), false);
  assert.strictEqual(hasScreen(null), false);
  assert.strictEqual(hasScreen(undefined), false);
});

test('cukup frame layar mempercepat pengiriman', () => {
  const good = [screenFrame(GOOD_SHARPNESS), screenFrame(GOOD_SHARPNESS + 50)];
  assert.strictEqual(countGoodFrames(good), TARGET_GOOD_FRAMES);
  assert.strictEqual(shouldSubmit(good, 1_200), true);
});

test('satu frame layar saja belum cukup: beri kesempatan frame kedua', () => {
  assert.strictEqual(shouldSubmit([screenFrame()], 1_200), false);
});

test('saat jendela habis, frame terbaik yang ada tetap dikirim', () => {
  const blurry = [frame(60, 0.02), frame(90, 0.03)];
  assert.strictEqual(shouldSubmit(blurry, SCAN_WINDOW_MS), true, 'jangan buang usaha pengunjung');
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

// Regresi penyebab utama kegagalan scan di lapangan: bingkai di layar dan area
// yang difoto berasal dari angka berbeda, sehingga hanya ~37% area kamera yang
// dikirim ke OCR dan struk yang terlihat "sudah pas" terpotong.
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
