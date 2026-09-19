import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCAN_FRAME_GAP_MS, SCAN_READ_DELAY_MS, MAX_FRAMES_TO_SEND,
  TARGET_USABLE_FRAMES, MAX_SUBMIT_ROUNDS,
  SUBMIT_POLL_TIMEOUT_MS, SUBMIT_POLL_INTERVAL_MS,
  GOOD_SHARPNESS, FAIR_SHARPNESS, SCREEN_BRIGHT_RATIO,
  classifyFrame, countGoodFrames, scanHint, isFrameUsable, hasScreen,
  shouldSubmitBatch, keepBestFrames, orderFramesForUpload,
  SCAN_GUIDE, guideFrameStyle,
} from './scanWindow.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const componentSource = fs.readFileSync(
  path.join(here, '..', 'components', 'PhotoBooth.tsx'), 'utf8'
);
const policySource = fs.readFileSync(path.join(here, 'scanWindow.ts'), 'utf8');

const frame = (sharpness, brightRatio) => ({ sharpness, brightRatio });
/** Frame yang benar-benar memuat layar HP (terang) dan tajam. */
const screenFrame = (sharpness = GOOD_SHARPNESS) => frame(sharpness, SCREEN_BRIGHT_RATIO + 0.1);

// ---------------------------------------------------------------------------
// Model: tidak ada batas waktu. Berhasil = tangkapan bagus + bukti terverifikasi.
// ---------------------------------------------------------------------------

test('tidak ada batas waktu pemindaian sama sekali', () => {
  // Tidak boleh ada konstanta jendela waktu maupun hitungan detik.
  assert.ok(!/SCAN_WINDOW_MS/.test(policySource), 'kebijakan tidak boleh punya jendela waktu');
  assert.ok(!/SCAN_WINDOW_MS/.test(componentSource), 'komponen tidak boleh punya jendela waktu');
  assert.ok(!/scanRemainingSeconds/.test(componentSource), 'hitungan detik harus hilang dari komponen');
  assert.ok(!/remainingSeconds|remainingMs|isWindowOver/.test(policySource), 'sisa waktu tidak relevan lagi');
  assert.ok(!/progressPercent/.test(componentSource), 'bar progres berbasis waktu harus hilang');
});

test('loop pemindaian tidak dibatasi waktu', () => {
  assert.match(componentSource, /while \(true\) \{/, 'loop berjalan sampai hasilnya jelas');
  assert.ok(!/while \(remainingMs/.test(componentSource), 'tidak boleh dibatasi sisa waktu');
  // Tidak boleh ada UI atau alur yang menyatakan pemindaian gagal karena waktu.
  assert.ok(
    !/Pemindaian Belum Berhasil[\s\S]{0,200}waktu habis/i.test(componentSource),
    'pesan gagal tidak boleh menyebut kehabisan waktu'
  );
  assert.ok(!/setTimeout\([\s\S]{0,40}\), SCAN_WINDOW_MS\)/.test(componentSource));
});

test('batch dikirim hanya setelah cukup frame layak', () => {
  assert.match(componentSource, /shouldSubmitBatch\(kept\)/, 'pengiriman harus lewat shouldSubmitBatch');
  assert.strictEqual(shouldSubmitBatch([screenFrame()]), false, 'satu frame belum cukup');
  assert.strictEqual(shouldSubmitBatch([screenFrame(), screenFrame(900)]), true, 'dua frame layak sudah cukup');
  assert.strictEqual(shouldSubmitBatch([]), false, 'tanpa frame jangan kirim');
  assert.strictEqual(TARGET_USABLE_FRAMES, 2);
});

test('frame ruangan tanpa bukti bayar tidak memicu pengiriman', () => {
  // Angka dari pengukuran kamera nyata: ruangan 1694-1955, struk 590.
  const ruangan = [frame(1955, 0.016), frame(1694, 0.018), frame(1707, 0.016)];
  assert.strictEqual(countGoodFrames(ruangan), 0);
  assert.strictEqual(shouldSubmitBatch(ruangan), false);
});

test('hasil needs_retry melanjutkan pemindaian, bukan menggagalkan', () => {
  // Komponen harus mengosongkan buffer lalu lanjut loop, bukan berhenti.
  assert.match(componentSource, /kept = \[\];/, 'frame lama dibuang agar tidak dikirim ulang');
  assert.match(componentSource, /Belum terbaca jelas/, 'beri tahu pengunjung bahwa masih dicoba');
  assert.match(componentSource, /mencoba lagi/, 'lanjut mencoba, bukan menyerah');
});

test('verified langsung lanjut ke sesi foto', () => {
  assert.match(componentSource, /if \(result\.verified\)/, 'harus menangani hasil verified');
  assert.match(componentSource, /setVerificationStatus\('verified'\)/);
  assert.match(componentSource, /setStep\('CAPTURE'\)/, 'lanjut otomatis ke halaman berikutnya');
});

test('bukti sudah dipakai dihentikan sebagai final, bukan diulang', () => {
  assert.match(componentSource, /DUPLICATE_REFERENCE/, 'anti-replay harus dikenali sebagai final');
  assert.match(componentSource, /setVerificationStatus\('rejected'\)/);
});

test('jatah kiriman per sesi dibatasi agar tidak mengunci diri', () => {
  // Backend membatasi 6 percobaan; sisakan dua untuk tombol "Coba Scan Lagi".
  assert.ok(MAX_SUBMIT_ROUNDS >= 2 && MAX_SUBMIT_ROUNDS <= 5, `dapat ${MAX_SUBMIT_ROUNDS}`);
  assert.match(componentSource, /rounds >= MAX_SUBMIT_ROUNDS/, 'batas kiriman harus ditegakkan');
});

test('ada penjaga agar layar tidak menggantung saat layanan bermasalah', () => {
  assert.ok(SUBMIT_POLL_TIMEOUT_MS >= 5000 && SUBMIT_POLL_TIMEOUT_MS <= 60_000, `dapat ${SUBMIT_POLL_TIMEOUT_MS}`);
  assert.ok(SUBMIT_POLL_INTERVAL_MS > 0, 'harus ada jeda antar pemeriksaan');
  assert.match(componentSource, /SUBMIT_POLL_TIMEOUT_MS/, 'penjaga waktu tunggu harus dipakai');
});

test('pengunjung diberi jeda sebelum frame pertama diambil', () => {
  assert.ok(SCAN_READ_DELAY_MS >= 1000, `jeda minimal 1 detik, dapat ${SCAN_READ_DELAY_MS}`);
  assert.match(componentSource, /setTimeout\(r, SCAN_READ_DELAY_MS\)/);
});

test('jeda antar frame cukup cepat agar terasa real-time', () => {
  assert.ok(SCAN_FRAME_GAP_MS > 0 && SCAN_FRAME_GAP_MS <= 1000, `dapat ${SCAN_FRAME_GAP_MS}`);
});

// ---------------------------------------------------------------------------
// Penilaian kualitas frame
// ---------------------------------------------------------------------------

test('klasifikasi ketajaman sesuai kalibrasi OCR', () => {
  assert.strictEqual(classifyFrame(GOOD_SHARPNESS), 'good');
  assert.strictEqual(classifyFrame(FAIR_SHARPNESS), 'fair');
  assert.strictEqual(classifyFrame(FAIR_SHARPNESS - 1), 'poor');
  assert.strictEqual(classifyFrame(0), 'poor');
});

test('frame layak butuh layar terlihat DAN cukup tajam', () => {
  assert.strictEqual(isFrameUsable(screenFrame()), true);
  assert.strictEqual(isFrameUsable(frame(GOOD_SHARPNESS, 0.01)), false, 'ruangan bukan layar');
  assert.strictEqual(isFrameUsable(frame(50, 0.5)), false, 'layar tapi terlalu buram');
});

test('frame tanpa brightRatio tidak dianggap memuat layar', () => {
  assert.strictEqual(hasScreen({ sharpness: 5000 }), false);
  assert.strictEqual(hasScreen(null), false);
  assert.strictEqual(hasScreen(undefined), false);
});

test('hint membedakan tiga kondisi yang dihadapi pengunjung', () => {
  assert.match(scanHint(null, false), /Arahkan/i);
  assert.match(scanHint(frame(150, 0.01), true), /[Ll]ayar HP belum terlihat/);
  assert.match(scanHint(screenFrame(150), true), /area scan/i);
  assert.match(scanHint(screenFrame(), true), /[Tt]angkapan bagus|baca/i);
  assert.match(scanHint(screenFrame(50), true), /stabil|tajam/i);
});

// ---------------------------------------------------------------------------
// Buffer frame
// ---------------------------------------------------------------------------

test('hanya frame terbaik yang disimpan, tidak menumpuk', () => {
  let kept = [];
  for (let i = 0; i < 200; i += 1) kept = keepBestFrames(kept, frame(i, 0.5));
  assert.strictEqual(kept.length, MAX_FRAMES_TO_SEND);
  assert.strictEqual(kept[0].sharpness, 199);
  assert.ok(kept.every((f) => f.sharpness >= 194));
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

// ---------------------------------------------------------------------------
// Bingkai panduan
// ---------------------------------------------------------------------------

test('bingkai panduan dihitung dari SCAN_GUIDE, tidak dikarang di JSX', () => {
  const style = guideFrameStyle();
  assert.strictEqual(style.width, `${SCAN_GUIDE.widthRatio * 100}%`);
  assert.strictEqual(style.height, `${SCAN_GUIDE.heightRatio * 100}%`);
  assert.match(componentSource, /guideFrameStyle\(\)/);
  assert.ok(SCAN_GUIDE.heightRatio > SCAN_GUIDE.widthRatio, 'bentuk layar HP: lebih tinggi daripada lebar');
});
