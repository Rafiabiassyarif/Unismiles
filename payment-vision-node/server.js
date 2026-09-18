const express = require('express');
const multer = require('multer');
const { createWorker } = require('tesseract.js');
const { pickBestFrame } = require('./ocr');

const app = express();
// Kiosk mengirim 6 jepretan supaya frame blur bisa dibuang; batas dinaikkan
// dari 3 agar tidak ditolak multer sebelum dinilai.
const upload = multer({ limits: { files: 8, fileSize: 8 * 1024 * 1024 } });
const port = Number(process.env.PORT || 5001);
const token = process.env.PAYMENT_VISION_SERVICE_TOKEN || '';
let workerPromise;
let busy = false;

function auth(req, res, next) {
  if (token && req.get('authorization') !== `Bearer ${token}`) return res.status(401).json({ detail: 'Unauthorized' });
  next();
}

async function getWorker() {
  if (!workerPromise) workerPromise = createWorker('eng');
  return workerPromise;
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'payment-vision-node' }));

app.post('/process', auth, upload.array('files', 8), async (req, res) => {
  if (busy) return res.status(429).json({ detail: 'Vision service busy' });
  if (!req.files?.length) return res.status(400).json({ detail: 'No image files' });
  busy = true;
  try {
    const worker = await getWorker();
    const expected = req.body.expected_amount;

    // OCR SETIAP frame, lalu pilih yang paling jelas. Sebelumnya teks semua
    // frame digabung jadi satu: satu frame blur ikut mencemari hasil, dan
    // kualitas dilaporkan angka tetap 0.18/0.86 yang tidak menggambarkan foto.
    const texts = [];
    for (const file of req.files) {
      const result = await worker.recognize(file.buffer);
      texts.push(result?.data?.text || '');
    }

    const best = pickBestFrame(texts, expected);
    if (!best) return res.status(400).json({ detail: 'No readable text' });

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
      model_version: 'tesseract-node-1.1'
    };

    console.log(
      `[VisionNode] ${req.files.length} frame, skor=${best.frame_scores.join(',')} ` +
      `terbaik=${qualityScore} nominal=${best.amount} status=${best.status}`
    );
    res.json(normalized);
  } catch (err) {
    console.error('[VisionNode]', err.message);
    res.status(503).json({ detail: 'Vision processing unavailable' });
  } finally { busy = false; }
});

app.listen(port, '0.0.0.0', () => console.log(`[VisionNode] listening on ${port}`));
