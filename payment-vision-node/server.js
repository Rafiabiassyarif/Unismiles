const express = require('express');
const multer = require('multer');
const jpeg = require('jpeg-js');
const { createWorker } = require('tesseract.js');
const { pickBestFrame, voteAmounts } = require('./ocr');
const { prepareForOcr, grayToRgba } = require('./preprocess');

const app = express();
// Kiosk mengirim beberapa jepretan supaya frame blur bisa dibuang; batas
// dinaikkan dari 3 agar tidak ditolak multer sebelum dinilai.
const upload = multer({ limits: { files: 8, fileSize: 8 * 1024 * 1024 } });
// Default port mengikuti port runtime KroomBox untuk site ini, supaya nilai di
// server tidak perlu diubah manual setiap kali deploy.
const port = Number(process.env.PORT || 5013);
const token = process.env.PAYMENT_VISION_SERVICE_TOKEN || '';
let workerPromise;

/**
 * Antrean kerja vision service.
 *
 * Sebelumnya ada satu flag `busy`, dan permintaan yang datang saat sibuk
 * langsung ditolak HTTP 429. Itu yang membuat scan gagal di kiosk:
 * backend mengirim batch setiap 2,5 detik, sementara satu batch OCR butuh
 * beberapa detik — jadi batch berikutnya selalu ditolak 429, dan pengunjung
 * melihat kegagalan walau buktinya benar.
 *
 * Sekarang permintaan TIDAK ditolak, hanya menunggu giliran. OCR bersifat
 * CPU-berat, jadi tetap dijalankan satu per satu (bukan paralel) supaya tidak
 * berebut CPU dan justru memperlambat semuanya.
 */
let chain = Promise.resolve();
let queued = 0;
const MAX_QUEUE = 20;

function enqueue(task) {
  if (queued >= MAX_QUEUE) {
    // Antrean terlalu panjang: satu-satunya kasus di mana permintaan ditolak.
    // Diberi status 503 (bukan 429) supaya backend tahu ini kelebihan beban,
    // bukan kesalahan pengunjung.
    return Promise.reject(Object.assign(new Error('Vision queue overloaded'), { overloaded: true }));
  }
  queued += 1;
  const run = chain.then(task);
  // Rantai antrean tidak boleh putus karena satu tugas gagal.
  chain = run.catch(() => {});
  return run.finally(() => { queued -= 1; });
}

function auth(req, res, next) {
  if (token && req.get('authorization') !== `Bearer ${token}`) return res.status(401).json({ detail: 'Unauthorized' });
  next();
}

async function getWorker() {
  if (!workerPromise) workerPromise = createWorker('eng');
  return workerPromise;
}

/**
 * Pass 2: OCR ulang pada gambar yang sudah diperbaiki.
 *
 * Hanya dijalankan kalau pass 1 gagal menemukan nominal tagihan, sehingga jalur
 * cepat tetap cepat.
 *
 * Dua perlakuan dijalankan, bukan satu, karena crop bisa salah:
 *  1. auto-crop + kontras + penajaman — paling kuat ketika layar HP berhasil
 *     dideteksi (struk jadi mendominasi gambar, teks lebih besar bagi OCR).
 *  2. penuh tanpa crop + kontras + penajaman — cadangan ketika deteksi layar
 *     gagal (mis. pencahayaan ruangan juga terang). Tanpa ini, crop yang salah
 *     justru membuang teks struk dan pass 2 tidak menolong sama sekali.
 * Lihat preprocess.js untuk catatan teknik mana yang diukur berguna.
 */
async function retryWithPreprocessing(worker, files, expected) {
  const texts = [];
  for (const file of files) {
    let decoded;
    try {
      decoded = jpeg.decode(file.buffer, { useTArray: true });
    } catch (err) {
      continue;
    }

    const cropped = prepareForOcr(decoded.data, decoded.width, decoded.height, { crop: true });
    const full = prepareForOcr(decoded.data, decoded.width, decoded.height, { crop: false });

    for (const prepared of [cropped, full]) {
      const rgba = grayToRgba(prepared.gray, prepared.width, prepared.height);
      const buffer = jpeg.encode({ data: rgba, width: prepared.width, height: prepared.height }, 95).data;
      const result = await worker.recognize(buffer);
      texts.push(result?.data?.text || '');
    }
  }
  return texts;
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'payment-vision-node' }));

app.post('/process', auth, upload.array('files', 8), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ detail: 'No image files' });

  try {
    // Dijalankan lewat antrean: permintaan tidak ditolak saat service sibuk,
    // hanya menunggu giliran. Lihat catatan di enqueue().
    const normalized = await enqueue(async () => {
      const worker = await getWorker();
      const expected = req.body.expected_amount;
      const expectedAmount = Number(expected) || null;

      // PASS 1 — OCR frame apa adanya. Jalur tercepat dan tetap jalur utama.
      let texts = [];
      for (const file of req.files) {
        const result = await worker.recognize(file.buffer);
        texts.push(result?.data?.text || '');
      }

      let best = pickBestFrame(texts, expected);
      let preprocessed = false;

      // PASS 2 — hanya kalau nominal tagihan belum ketemu di pass 1.
      // Gambar buram atau redup masih bisa diselamatkan setelah penajaman.
      if (expectedAmount && best && best.amount !== expectedAmount) {
        const retryTexts = await retryWithPreprocessing(worker, req.files, expected);
        const retryBest = pickBestFrame(retryTexts, expected);
        if (retryBest && retryBest.amount === expectedAmount) {
          texts = texts.concat(retryTexts);
          best = retryBest;
          preprocessed = true;
        } else if (retryBest && !best.amount && retryBest.amount) {
          // Pass 1 tidak menemukan nominal sama sekali; pass 2 menemukan angka.
          best = retryBest;
          preprocessed = true;
        }
      }

      // Gabungkan kandidat dari semua frame: satu frame bisa salah baca satu
      // digit sementara frame lain benar. Diterima hanya bila sama persis.
      const vote = expectedAmount ? voteAmounts(texts, expectedAmount) : null;
      if (vote && vote.matched && best.amount !== expectedAmount) {
        best = { ...best, amount: expectedAmount, amount_from_vote: true };
      }

      const qualityScore = best.frame_score;
      const successful = best.status === 'success' || best.status === 'berhasil';

      const normalized = {
        provider: { label: best.provider, confidence: best.provider_confidence },
        provider_confidence: best.provider_confidence,
        screen_type: {
          label: best.screen_type,
          confidence: best.screen_type === 'receipt_detail' ? 0.9 : 0.2
        },
        status: best.status,
        amount: best.amount,
        merchant: best.merchant,
        reference_id: best.reference_id,
        ocr_text: best.ocr_text,
        amount_candidates: best.amount_candidates,
        frames_received: req.files.length,
        frame_scores: best.frame_scores,
        fields: {
          status: { value: best.status, confidence: successful ? 0.9 : 0.3 },
          amount: { value: best.amount, confidence: best.amount ? 0.9 : 0 },
          merchant_name: { value: best.merchant, confidence: best.merchant !== 'UNKNOWN' ? 0.75 : 0.2 },
          paid_at: { value: successful ? new Date().toISOString() : null, confidence: successful ? 0.7 : 0 },
          reference_id: { value: best.reference_id, confidence: best.reference_id ? 0.8 : 0 }
        },
        quality: { score: qualityScore },
        liveness: { score: req.files.length > 1 ? 0.8 : 0.5 },
        tamper_score: 0.1,
        model_version: 'tesseract-node-1.2'
      };

      console.log(
        `[VisionNode] ${req.files.length} frame, skor=${best.frame_scores.join(',')} ` +
        `terbaik=${qualityScore} nominal=${best.amount} status=${best.status}` +
        `${preprocessed ? ' (preprocessing)' : ''}` +
        `${best.amount_from_vote ? ' (gabung kandidat)' : ''}`
      );
      return normalized;
    });

    res.json(normalized);
  } catch (err) {
    // 503 supaya backend tahu ini masalah layanan (layak dicoba lagi), bukan
    // kegagalan verifikasi yang harus dilaporkan sebagai bukti tidak sah.
    console.error('[VisionNode]', err.message);
    res.status(503).json({
      detail: err.overloaded ? 'Vision service overloaded' : 'Vision processing unavailable'
    });
  }
});

app.listen(port, '0.0.0.0', () => console.log(`[VisionNode] listening on ${port}`));
