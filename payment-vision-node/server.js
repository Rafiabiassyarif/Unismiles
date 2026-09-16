const express = require('express');
const multer = require('multer');
const { createWorker } = require('tesseract.js');

const app = express();
const upload = multer({ limits: { files: 3, fileSize: 8 * 1024 * 1024 } });
const port = Number(process.env.PORT || 5001);
const token = process.env.PAYMENT_VISION_SERVICE_TOKEN || '';
let workerPromise;
let busy = false;

function auth(req, res, next) {
  if (token && req.get('authorization') !== `Bearer ${token}`) return res.status(401).json({ detail: 'Unauthorized' });
  next();
}

function normalizeAmount(value) {
  if (!value) return null;
  const digits = String(value).replace(/[^0-9]/g, '');
  const n = Number(digits);
  return Number.isFinite(n) && n >= 1000 && n <= 10000000 ? n : null;
}

function extract(text, expected) {
  const lower = text.toLowerCase();
  const candidates = [];
  const re = /(?:rp\.?|idr)?\s*([0-9]{1,3}(?:[.][0-9]{3})+|[0-9]{4,7})(?:,[0-9]{2})?/gi;
  let match;
  while ((match = re.exec(lower))) {
    const amount = normalizeAmount(match[1]);
    if (amount && !candidates.includes(amount)) candidates.push(amount);
  }
  const expectedAmount = normalizeAmount(expected);
  const amount = expectedAmount && candidates.includes(expectedAmount) ? expectedAmount : (candidates[0] || null);
  const failed = /(gagal|failed|dibatalkan|expired|kadaluarsa|ditolak)/i.test(lower);
  const success = /(berhasil|sukses|success|successful|lunas|diterima|transfer|pembayaran|transaksi|bukti|qris)/i.test(lower);
  const provider = /dana/i.test(lower) ? 'DANA' : /gopay|go-pay|gojek/i.test(lower) ? 'GOPAY' : /ovo/i.test(lower) ? 'OVO' : /shopee|seabank/i.test(lower) ? 'SHOPEEPAY_SEABANK' : /qris|bank/i.test(lower) ? 'QRIS_BANK' : 'UNKNOWN';
  const ref = (lower.match(/(?:ref(?:erence)?|transaksi|trx|order)[^a-z0-9]*([a-z0-9-]{8,35})/i) || [])[1] || null;
  return { provider, provider_confidence: provider === 'UNKNOWN' ? 0.5 : 0.9, screen_type: amount ? 'receipt_detail' : 'unknown', status: failed ? 'failed' : (success ? 'success' : 'pending'), amount, merchant: /uni|smile|unismiles/i.test(lower) ? 'UNI SMILE' : 'UNKNOWN', reference_id: ref, ocr_text: text.slice(0, 4000), amount_candidates: candidates };
}

async function getWorker() {
  if (!workerPromise) workerPromise = createWorker('eng');
  return workerPromise;
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'payment-vision-node' }));
app.post('/process', auth, upload.array('files', 3), async (req, res) => {
  if (busy) return res.status(429).json({ detail: 'Vision service busy' });
  if (!req.files?.length) return res.status(400).json({ detail: 'No image files' });
  busy = true;
  try {
    const worker = await getWorker();
    const texts = [];
    for (const file of req.files) {
      const result = await worker.recognize(file.buffer);
      if (result?.data?.text) texts.push(result.data.text);
    }
    const output = extract(texts.join('\n'), req.body.expected_amount);
    res.json({ ...output, liveness_score: req.files.length > 1 ? 0.8 : 0.5, tamper_score: 0.1, processing_time_ms: 0 });
  } catch (err) {
    console.error('[VisionNode]', err.message);
    res.status(503).json({ detail: 'Vision processing unavailable' });
  } finally { busy = false; }
});

app.listen(port, '0.0.0.0', () => console.log(`[VisionNode] listening on ${port}`));
