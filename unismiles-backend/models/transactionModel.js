const pool = require('../config/db');

const Transaction = {
  async create(transactionData) {
    const { session_id, transaction_code, amount, payment_method } = transactionData;
    const [result] = await pool.query(
      'INSERT INTO transactions (session_id, transaction_code, amount, payment_method, status) VALUES (?, ?, ?, ?, ?)',
      [session_id, transaction_code, amount, payment_method, 'pending']
    );
    return result;
  },

  async updateStatusBySessionId(sessionId, status) {
    const [result] = await pool.query(
      'UPDATE transactions SET status = ? WHERE session_id = ?',
      [status, sessionId]
    );
    return result;
  },

  async findBySessionId(sessionId) {
    const [rows] = await pool.query(
      'SELECT id, session_id, transaction_code, amount, payment_method, status, created_at FROM transactions WHERE session_id = ? LIMIT 1',
      [sessionId]
    );
    return rows[0] || null;
  },
};

module.exports = Transaction;
