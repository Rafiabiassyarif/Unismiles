const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..');
const controller = fs.readFileSync(
  path.join(backendRoot, 'controllers', 'paymentVerificationController.js'), 'utf8'
);
const visionServer = fs.readFileSync(
  path.join(backendRoot, '..', 'payment-vision-node', 'server.js'), 'utf8'
);

/**
 * Keluhan nyata di kiosk: POST /api/v1/kiosk/sessions/:code/payment-verifications
 * menjawab 400 Bad Request setiap kali memindai bukti bayar.
 *
 * Dua sebab yang ditemukan di log produksi:
 *   1. Sesi sudah kedaluwarsa. Masa berlaku dihitung sejak sesi DIBUAT — dan sesi
 *      dibuat saat pengunjung memilih layout, sebelum berfoto. Durasi foto 4-5
 *      menit sementara masa berlaku bawaan 5 menit, jadi sesi selalu habis
 *      sebelum sampai layar pembayaran.
 *   2. Vision service menjawab HTTP 429 "Vision service busy" karena hanya satu
 *      batch boleh jalan pada satu waktu, sementara backend mengirim batch tiap
 *      2,5 detik.
 */

/** Hanya baris kode — komentar penjelas juga menyebut istilah yang dicari. */
const codeOnly = (src) =>
  src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'));

test('kedaluwarsa sesi tidak lagi memblokir pemindaian', () => {
  const code = codeOnly(controller).join('\n');
  assert.ok(!/Sesi pembayaran sudah kadaluwarsa/.test(code),
    'penolakan 400 karena kedaluwarsa harus hilang dari jalur unggah bukti');
  assert.ok(!/Date\.now\(\) > new Date\(session\.payment_expires_at\)/.test(code),
    'jangan membandingkan waktu kedaluwarsa di jalur unggah bukti');
});

test('masa berlaku diperpanjang setiap bukti diterima', () => {
  // Supaya sesi yang benar-benar ditinggalkan tetap bisa dibersihkan, tapi
  // pengunjung yang sedang memindai tidak pernah terputus.
  assert.match(controller, /PAYMENT_ACTIVE_WINDOW_MINUTES/, 'harus ada jendela aktif');
  assert.match(
    controller,
    /UPDATE sessions SET payment_expires_at = DATE_ADD\(NOW\(\), INTERVAL \? MINUTE\)/,
    'masa berlaku harus diperpanjang ke depan, bukan dibiarkan lewat'
  );
  const window = controller.match(/PAYMENT_ACTIVE_WINDOW_MINUTES = (\d+)/);
  assert.ok(window, 'jendela aktif harus berupa angka menit');
  assert.ok(Number(window[1]) >= 10, `jendela aktif terlalu pendek: ${window[1]} menit`);
});

test('bukti dengan nomor referensi sama tetap ditolak (anti-replay)', () => {
  // Gerbang kedaluwarsa dihapus, TAPI anti-replay harus tetap ada — kalau tidak,
  // satu struk bisa dipakai berkali-kali.
  const decision = fs.readFileSync(
    path.join(backendRoot, 'utils', 'paymentDecision.js'), 'utf8'
  );
  assert.match(decision, /DUPLICATE_REFERENCE/, 'anti-replay harus tetap ada');
  // Controller harus meneruskan informasi duplikat ke modul keputusan.
  assert.match(controller, /duplicateReference/, 'controller harus menandai bukti duplikat');
});

test('vision service mengantre, bukan menolak saat sibuk', () => {
  assert.ok(
    !/Vision service busy/.test(visionServer),
    'penolakan 429 saat sibuk harus hilang — itu penyebab scan gagal'
  );
  assert.ok(
    !/if \(busy\) return res\.status\(429\)/.test(visionServer),
    'tidak boleh menolak berdasarkan flag busy'
  );
  assert.match(visionServer, /function enqueue\(task\)/, 'harus ada antrean');
  assert.match(visionServer, /await enqueue\(async \(\) =>/, 'handler harus memakai antrean');
});

test('antrean vision hanya dibatasi saat benar-benar kebanjiran', () => {
  // OCR bersifat CPU-berat: satu per satu lebih cepat daripada paralel.
  assert.match(visionServer, /MAX_QUEUE/, 'harus ada batas antrean');
  assert.match(visionServer, /queued \+= 1/, 'penghitung antrean harus naik');
  assert.match(visionServer, /queued -= 1/, 'penghitung antrean harus turun setelah selesai');
  assert.match(visionServer, /chain = run\.catch\(\(\) => \{\}\);/,
    'rantai antrean tidak boleh putus karena satu tugas gagal');
});

test('kelebihan beban dilaporkan sebagai masalah layanan, bukan bukti tidak sah', () => {
  // 503 -> backend tahu ini layak dicoba lagi. 429 lama membuat backend
  // melaporkannya sebagai kegagalan verifikasi.
  assert.match(visionServer, /res\.status\(503\)/, 'harus memakai 503');
  assert.ok(!/res\.status\(429\)/.test(visionServer), 'tidak boleh lagi memakai 429');
});
