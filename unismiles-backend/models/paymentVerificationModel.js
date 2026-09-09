const pool = require('../config/db');

const PaymentVerificationModel = {
  async create(data) {
    const {
      id,
      session_id,
      kiosk_id,
      attempt_number,
      status,
      decision,
      expected_amount,
      evidence_private_path,
      evidence_delete_at
    } = data;

    const [result] = await pool.query(
      `INSERT INTO payment_verification_attempts 
       (id, session_id, kiosk_id, attempt_number, status, decision, expected_amount, evidence_private_path, evidence_delete_at, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, session_id, kiosk_id, attempt_number, status, decision, expected_amount, evidence_private_path, evidence_delete_at]
    );
    return result;
  },

  async update(id, data) {
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(data)) {
      fields.push(`\`${key}\` = ?`);
      // Handle JSON values
      if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
    }

    if (fields.length === 0) return;

    values.push(id);

    const [result] = await pool.query(
      `UPDATE payment_verification_attempts SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
    return result;
  },

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT * FROM payment_verification_attempts WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async findBySessionId(sessionId) {
    const [rows] = await pool.query(
      `SELECT * FROM payment_verification_attempts WHERE session_id = ? ORDER BY attempt_number DESC`,
      [sessionId]
    );
    return rows;
  },

  async countAttempts(sessionId) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) as count FROM payment_verification_attempts WHERE session_id = ?`,
      [sessionId]
    );
    return rows[0]?.count || 0;
  },

  async findByReferenceHmac(referenceHmac) {
    if (!referenceHmac) return null;
    const [rows] = await pool.query(
      `SELECT * FROM payment_verification_attempts WHERE reference_hmac = ? AND decision = 'verified' LIMIT 1`,
      [referenceHmac]
    );
    return rows[0] || null;
  }
};

module.exports = PaymentVerificationModel;
