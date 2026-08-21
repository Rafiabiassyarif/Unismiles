const pool = require('../config/db');

const Photo = {
  async create(photoData) {
    const { session_id, url, email_sent_to } = photoData;
    const [result] = await pool.query(
      'INSERT INTO photos (session_id, url, email_sent_to) VALUES (?, ?, ?)',
      [session_id, url, email_sent_to || null]
    );
    return result;
  },

  async findBySessionId(sessionId) {
    const [rows] = await pool.query(
      'SELECT id, session_id, url, email_sent_to, created_at FROM photos WHERE session_id = ?',
      [sessionId]
    );
    return rows;
  },
};

module.exports = Photo;
