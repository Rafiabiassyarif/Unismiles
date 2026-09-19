const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const pool = require('../config/db');
const PaymentVerificationModel = require('../models/paymentVerificationModel');
const Session = require('../models/sessionModel');
const Transaction = require('../models/transactionModel');
const PaymentProfile = require('../models/paymentProfileModel');
const VisionClient = require('../utils/visionClient');

const privateUploadsDir = path.join(__dirname, '../private_uploads');

// Ensure private uploads directory exists
fs.mkdir(privateUploadsDir, { recursive: true }).catch(console.error);

// Calculate HMAC of Normalized Reference ID for anti-replay
function calculateReferenceHmac(referenceId) {
  if (!referenceId) return null;
  const normalized = String(referenceId).trim().replace(/\s+/g, '').toLowerCase();
  const secret = process.env.HMAC_SECRET || 'unismiles-hmac-secret-key-123';
  return crypto.createHmac('sha256', secret).update(normalized).digest('hex');
}

// Check if merchant name matches configured aliases
function matchMerchant(extractedMerchant, profile) {
  if (!extractedMerchant) return false;
  
  const extracted = String(extractedMerchant).trim().toLowerCase();
  
  // Try matching with profile details
  const merchantName = String(profile.merchant_name || '').trim().toLowerCase();
  const displayName = String(profile.display_name || '').trim().toLowerCase();
  
  if (extracted === merchantName || extracted === displayName) return true;

  // Check aliases from JSON payment_data
  let paymentData = {};
  try {
    paymentData = typeof profile.payment_data === 'string' 
      ? JSON.parse(profile.payment_data) 
      : profile.payment_data || {};
  } catch (e) {}

  const aliases = Array.isArray(paymentData.merchant_aliases) 
    ? paymentData.merchant_aliases 
    : [];

  return aliases.some(alias => String(alias).trim().toLowerCase() === extracted);
}

// Main background processing function
async function processVerificationInBackground(attemptId, sessionCode, kioskId, expectedAmount, frames, challengeId) {
  console.log(`[Background-Verify] Processing attempt ${attemptId} for session ${sessionCode}`);
  
  try {
    // 1. Send to Python computer vision service
    const frameBuffers = frames.map(f => f.buffer);
    const visionResult = await VisionClient.processFrames(frameBuffers, challengeId, expectedAmount);
    
    console.log(`[Background-Verify] Vision response:`, JSON.stringify(visionResult));

    const fields = visionResult.fields || {};
    const extractedAmount = fields.amount?.value ? Number(fields.amount.value) : null;
    const extractedStatus = fields.status?.value ? String(fields.status.value).trim().toLowerCase() : null;
    const extractedMerchant = fields.merchant_name?.value || null;
    const extractedPaidAt = fields.paid_at?.value || null;
    const referenceId = fields.reference_id?.value || null;
    const provider = visionResult.provider?.label || 'UNKNOWN';
    const screenType = visionResult.screen_type?.label || 'unknown';
    
    const qualityScore = visionResult.quality?.score ?? 0;
    const livenessScore = visionResult.liveness?.score ?? 0;
    const tamperScore = visionResult.tamper_score ?? 0;

    const reasonCodes = [];
    let decision = 'verified';

    // 2. Fetch payment profiles to validate merchant aliases
    const [kiosk] = await pool.query('SELECT user_id FROM kiosks WHERE id = ? LIMIT 1', [kioskId]);
    const userId = kiosk[0]?.user_id;
    const profile = await PaymentProfile.findDefaultForKiosk(userId);

    // Apply strict validation rules
    // Ambang kualitas memakai skor frame asli dari vision service. Skor 0.18
    // lama dipakai sebagai penanda tetap "OCR gagal total", bukan hasil ukur.
    if (qualityScore < 0.35) {
      reasonCodes.push('IMAGE_BLURRY');
      decision = 'needs_retry';
    }
    
    if (screenType !== 'receipt_detail') {
      reasonCodes.push('DETAIL_SCREEN_REQUIRED');
      decision = 'needs_retry';
    }

    if (extractedStatus !== 'success' && extractedStatus !== 'berhasil') {
      reasonCodes.push('PAYMENT_NOT_SUCCESS');
      decision = 'needs_retry';
    }

    const isStrictMatch = process.env.PAYMENT_STRICT_MATCH === 'true';

    // Nominal adalah bukti utama: nominal kiosk sudah unik per transaksi
    // (harga Admin + kode unik Rp1-Rp99). Kalau nominal terbaca persis dan
    // status sukses, itu sudah cukup mencocokkan bukti ke sesi ini. Sisa
    // alasan tidak boleh menggagalkan pembayaran yang sudah jelas benar.
    const amountMatches = Boolean(extractedAmount) && extractedAmount === Number(expectedAmount);
    const paymentClearlyProven = amountMatches && (extractedStatus === 'success' || extractedStatus === 'berhasil');

    if (isStrictMatch && !amountMatches) {
      reasonCodes.push('AMOUNT_MISMATCH');
      decision = 'needs_retry';
    } else if (extractedAmount && !amountMatches) {
      console.log(`[Testing Mode] Extracted amount Rp ${extractedAmount} accepted (Expected: Rp ${expectedAmount})`);
    }

    const hasConfiguredMerchant = profile && (profile.merchant_name || profile.display_name);
    if (isStrictMatch && !paymentClearlyProven && hasConfiguredMerchant && !matchMerchant(extractedMerchant, profile)) {
      reasonCodes.push('MERCHANT_MISMATCH');
      decision = 'needs_retry';
    }

    const referenceHmac = calculateReferenceHmac(referenceId);
    if (referenceHmac) {
      const duplicateAttempt = await PaymentVerificationModel.findByReferenceHmac(referenceHmac);
      if (duplicateAttempt) {
        reasonCodes.push('DUPLICATE_REFERENCE');
        decision = 'rejected';
      }
    } else if (!paymentClearlyProven) {
      // Tanpa nominal yang cocok, nomor referensi adalah satu-satunya pengaman
      // anti-pemakaian-ulang. Kalau nominal sudah cocok persis, bukti ini tetap
      // sah walaupun nomor referensinya tidak terbaca.
      reasonCodes.push('LOW_CONFIDENCE');
      decision = 'needs_retry';
    }

    // Check freshness of the receipt (only enforced in strict production mode)
    if (isStrictMatch && !paymentClearlyProven && extractedPaidAt) {
      const paidTime = new Date(extractedPaidAt);
      const now = new Date();
      // Must be paid within the last 1 hour
      if (Math.abs(now - paidTime) > 60 * 60 * 1000) {
        reasonCodes.push('STALE_RECEIPT');
        decision = 'rejected';
      }
    }

    // Save evidence frame to private storage if it requires manual review or rejection
    let evidencePrivatePath = null;
    if (decision !== 'verified' && frames.length > 0) {
      const frameFile = `evidence_${attemptId}.jpg`;
      const filePath = path.join(privateUploadsDir, frameFile);
      await fs.writeFile(filePath, frames[0].buffer);
      evidencePrivatePath = `/private_uploads/${frameFile}`;
    }

    // TTL for evidence clean up (15 mins for auto decisions, 24 hours for manual review)
    const retentionMins = decision === 'manual_review' ? 24 * 60 : 15;
    const evidenceDeleteAt = new Date(Date.now() + retentionMins * 60 * 1000);

    // Save results in Database
    await PaymentVerificationModel.update(attemptId, {
      status: decision === 'verified' ? 'verified' : 'failed',
      decision,
      extracted_amount: extractedAmount,
      provider_detected: provider,
      screen_type: screenType,
      merchant_normalized: extractedMerchant,
      reference_hmac: referenceHmac,
      ocr_confidence: fields.amount?.confidence ?? 0,
      provider_confidence: visionResult.provider?.confidence ?? 0,
      quality_score: qualityScore,
      liveness_score: livenessScore,
      tamper_score: tamperScore,
      reason_codes: reasonCodes,
      model_version: visionResult.model_version || '1.0',
      rules_version: '1.0',
      evidence_private_path: evidencePrivatePath,
      evidence_delete_at: evidenceDeleteAt
    });

    if (decision === 'verified') {
      // Finalize session and transactions atomically
      const conn = await pool.getConnection();
      await conn.beginTransaction();

      try {
        // Create Transaction
        const transactionCode = 'TRX-' + Date.now();
        await conn.query(
          `INSERT INTO transactions 
           (session_id, transaction_code, amount, payment_method, status, verification_method, provider_detected, reference_hmac, paid_at, verified_at, verification_attempt_id, model_version, rules_version) 
           VALUES (?, ?, ?, 'QRIS', 'success', 'qris_visual_proof', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, '1.0')`,
          [sessionCode, transactionCode, expectedAmount, provider, referenceHmac, attemptId, visionResult.model_version || '1.0']
        );

        // Get insert ID of transaction
        const [trxRows] = await conn.query('SELECT LAST_INSERT_ID() as id');
        const transactionId = trxRows[0]?.id;

        // Update verification attempt with transaction ID
        await conn.query(
          'UPDATE payment_verification_attempts SET transaction_id = ? WHERE id = ?',
          [transactionId, attemptId]
        );

        // Update Session status
        await conn.query(
          `UPDATE sessions SET 
             payment_status = 'verified', 
             payment_verified_at = CURRENT_TIMESTAMP, 
             payment_verification_method = 'qris_visual_proof',
             active_verification_attempt_id = ?
           WHERE session_code = ?`,
          [attemptId, sessionCode]
        );

        await conn.commit();
        console.log(`[Background-Verify] Attempt ${attemptId} successfully verified!`);
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
  } catch (error) {
    // Pesan error asli disimpan ke DB, bukan hanya dicetak ke log.
    //
    // Sebelumnya hanya `reason_codes: ['INTERNAL_ERROR']` yang tersimpan, jadi
    // penyebab sebenarnya tidak bisa dilihat dari panel (log PM2 situs ini tidak
    // terjangkau) dan diagnosa jadi menebak-nebak. Sekarang pesan ringkasnya ikut
    // masuk ke review_reason supaya bisa dibaca langsung di Admin.
    const detail = [
      `${error?.name || 'Error'}: ${String(error?.message || error).slice(0, 160)}`,
      error?.code ? `code=${error.code}` : null,
      error?.sqlMessage ? `sql=${String(error.sqlMessage).slice(0, 120)}` : null,
      error?.cause?.code ? `cause=${error.cause.code}` : null,
    ].filter(Boolean).join(' | ');

    console.error(`[Background-Verify] Error during processing:`, detail, error);

    await PaymentVerificationModel.update(attemptId, {
      status: 'error',
      decision: 'manual_review',
      reason_codes: ['INTERNAL_ERROR'],
      review_reason: detail.slice(0, 255)
    });
  }
}

const PaymentVerificationController = {
  async submitEvidence(req, res) {
    try {
      const sessionCode = req.params.session_code;
      const { challenge_id } = req.body;
      const kioskId = req.kiosk.id;
      const frames = req.files || [];

      if (!sessionCode) {
        return res.status(400).json({ success: false, message: 'session_code wajib diisi' });
      }

      if (frames.length === 0) {
        return res.status(400).json({ success: false, message: 'Tidak ada frame bukti pembayaran yang diunggah' });
      }

      // Check Session & Kiosk Ownership
      const [sessions] = await pool.query(
        `SELECT s.session_code as session_id, s.payment_status, s.payment_required_amount, s.payment_expires_at
         FROM sessions s
         WHERE s.session_code = ? AND s.kiosk_id = ?
         LIMIT 1`,
        [sessionCode, kioskId]
      );

      if (!sessions.length) {
        return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
      }

      const session = sessions[0];

      if (session.payment_status === 'verified') {
        return res.status(400).json({ success: false, message: 'Pembayaran untuk sesi ini sudah terverifikasi' });
      }

      if (session.payment_expires_at && Date.now() > new Date(session.payment_expires_at).getTime()) {
        return res.status(400).json({ success: false, message: 'Sesi pembayaran sudah kadaluwarsa' });
      }

      // Batas percobaan per sesi.
      //
      // DISETEL KE 0 = TANPA BATAS, sesuai permintaan: pengunjung bebas mencoba
      // sampai bukti bayarnya terbaca. Sebelumnya 6, dan itu membuat pengunjung
      // mentok di tengah jalan padahal bukti aslinya sah.
      //
      // Pengaman yang tetap berlaku (bukan batas jumlah percobaan):
      //  - tembolok memori untuk unggahan dibatasi ukuran & jumlah berkas
      //  - anti-replay: bukti dengan nomor referensi sama tidak bisa dipakai dua kali
      //  - sesi tetap punya masa kedaluwarsa pembayaran
      //  - rate limiter /api/ (300 per menit per IP) menahan banjir permintaan
      const envLimit = Number(process.env.PAYMENT_MAX_SCAN_ATTEMPTS);
      const MAX_SCAN_ATTEMPTS = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : 0;

      // Dihitung sekali: dipakai untuk menegakkan batas (kalau diaktifkan) dan
      // untuk nomor percobaan.
      const attemptCount = await PaymentVerificationModel.countAttempts(session.session_id);

      if (MAX_SCAN_ATTEMPTS > 0 && attemptCount >= MAX_SCAN_ATTEMPTS) {
        return res.status(429).json({ success: false, message: `Batas maksimum scan bukti pembayaran (${MAX_SCAN_ATTEMPTS} kali) telah tercapai.` });
      }

      const attemptId = crypto.randomUUID();
      const attemptNum = attemptCount + 1;

      // Create initial verification log
      await PaymentVerificationModel.create({
        id: attemptId,
        session_id: session.session_id,
        kiosk_id: kioskId,
        attempt_number: attemptNum,
        status: 'received',
        decision: 'processing',
        expected_amount: session.payment_required_amount,
        evidence_private_path: null,
        evidence_delete_at: new Date(Date.now() + 15 * 60 * 1000)
      });

      // Trigger verification in background
      processVerificationInBackground(
        attemptId,
        session.session_id,
        kioskId,
        session.payment_required_amount,
        frames,
        challenge_id
      );

      return res.status(202).json({
        success: true,
        data: {
          attempt_id: attemptId,
          status: 'processing',
          poll_after_ms: 1000
        }
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async checkAttempt(req, res) {
    try {
      const attemptId = req.params.attempt_id;
      const attempt = await PaymentVerificationModel.findById(attemptId);

      if (!attempt) {
        return res.status(404).json({ success: false, message: 'Attempt verifikasi tidak ditemukan' });
      }

      return res.status(200).json({
        success: true,
        data: {
          attempt_id: attempt.id,
          status: attempt.status,
          decision: attempt.decision,
          provider: attempt.provider_detected,
          reason_codes: typeof attempt.reason_codes === 'string' ? JSON.parse(attempt.reason_codes) : (attempt.reason_codes || [])
        }
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Admin override endpoints
  async getAttempts(req, res) {
    try {
      const sessionCode = req.query.session_id || req.query.session_code;
      if (!sessionCode) {
        return res.status(400).json({ success: false, message: 'session_id wajib diisi' });
      }

      // Check session
      const [sessions] = await pool.query(
        'SELECT session_code FROM sessions WHERE session_code = ? LIMIT 1',
        [sessionCode]
      );
      if (!sessions.length) {
        return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
      }

      const attempts = await PaymentVerificationModel.findBySessionId(sessions[0].session_code);
      return res.status(200).json({ success: true, data: attempts });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Serve private evidence file to authenticated admin
  async getEvidenceFile(req, res) {
    try {
      const attemptId = req.params.attempt_id;
      const attempt = await PaymentVerificationModel.findById(attemptId);
      if (!attempt || !attempt.evidence_private_path) {
        return res.status(404).json({ success: false, message: 'File bukti tidak ditemukan atau sudah dihapus' });
      }

      const filename = path.basename(attempt.evidence_private_path);
      const filePath = path.join(privateUploadsDir, filename);

      try {
        await fs.access(filePath);
        return res.sendFile(filePath);
      } catch (err) {
        return res.status(404).json({ success: false, message: 'File bukti sudah dihapus dari disk' });
      }
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Admin manual override approve/reject
  async overridePayment(req, res) {
    const conn = await pool.getConnection();
    try {
      const attemptId = req.params.attempt_id;
      const { action, reason } = req.body; // action: 'approve' or 'reject'

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Action tidak valid' });
      }

      if (!reason) {
        return res.status(400).json({ success: false, message: 'Alasan wajib diisi untuk override manual' });
      }

      const attempt = await PaymentVerificationModel.findById(attemptId);
      if (!attempt) {
        return res.status(404).json({ success: false, message: 'Attempt tidak ditemukan' });
      }

      await conn.beginTransaction();

      if (action === 'approve') {
        const transactionCode = 'TRX-MAN-' + Date.now();
        // Insert success transaction
        await conn.query(
          `INSERT INTO transactions 
           (session_id, transaction_code, amount, payment_method, status, verification_method, paid_at, verified_at, verification_attempt_id, failure_reason_code) 
           VALUES (?, ?, ?, 'manual_override', 'success', 'admin_override', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)`,
          [attempt.session_id, transactionCode, attempt.expected_amount, attemptId, reason]
        );

        // Get trx ID
        const [trxRows] = await conn.query('SELECT LAST_INSERT_ID() as id');
        const transactionId = trxRows[0]?.id;

        // Update attempt
        await conn.query(
          `UPDATE payment_verification_attempts SET 
             status = 'verified', decision = 'verified', transaction_id = ? 
           WHERE id = ?`,
          [transactionId, attemptId]
        );

        // Update Session
        await conn.query(
          `UPDATE sessions SET 
             payment_status = 'verified', 
             payment_verified_at = CURRENT_TIMESTAMP, 
             payment_verification_method = 'admin_override',
             active_verification_attempt_id = ?
           WHERE session_code = ?`,
          [attemptId, attempt.session_id]
        );

        console.log(`[AdminOverride] Approved attempt ${attemptId} by admin. Reason: ${reason}`);
      } else {
        // action: reject
        await conn.query(
          `UPDATE payment_verification_attempts SET 
             status = 'failed', decision = 'rejected', reason_codes = ? 
           WHERE id = ?`,
          [JSON.stringify(['ADMIN_REJECTED', reason]), attemptId]
        );

        // Update Session
        await conn.query(
          `UPDATE sessions SET 
             payment_status = 'rejected', 
             active_verification_attempt_id = ?
           WHERE session_code = ?`,
          [attemptId, attempt.session_id]
        );

        console.log(`[AdminOverride] Rejected attempt ${attemptId} by admin. Reason: ${reason}`);
      }

      await conn.commit();
      return res.status(200).json({ success: true, message: `Override ${action} berhasil dilakukan` });
    } catch (error) {
      await conn.rollback();
      return res.status(500).json({ success: false, message: error.message });
    } finally {
      conn.release();
    }
  }
};

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 30 }
}).array('frames', 30);

module.exports = { PaymentVerificationController, uploadMemory };
