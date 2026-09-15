const pool = require('../config/db');

const Session = {
  async create(sessionData) {
    const { session_code, kiosk_id, frame_template_id } = sessionData;
    try {
      const [result] = await pool.query(
        'INSERT INTO sessions (session_code, kiosk_id, frame_template_id, status, started_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [session_code, kiosk_id, frame_template_id, 'active']
      );
      return result;
    } catch (err) {
      // Older/live schemas still require the primary-key `id`, while newer
      // schemas also expose `session_code`. Fill both when the first insert
      // fails because `id` has no default or the schema lacks session_code.
      if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_DEFAULT_FOR_FIELD') {
        const [result] = await pool.query(
          'INSERT INTO sessions (id, session_code, kiosk_id, frame_template_id, status, started_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
          [session_code, session_code, kiosk_id, frame_template_id, 'active']
        );
        return result;
      }
      throw err;
    }
  },

  async updateStatus(sessionCode, status) {
    try {
      if (status === 'completed') {
        const [result] = await pool.query(
          'UPDATE sessions SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE session_code = ?',
          [status, sessionCode]
        );
        return result;
      }
      const [result] = await pool.query(
        'UPDATE sessions SET status = ? WHERE session_code = ?',
        [status, sessionCode]
      );
      return result;
    } catch (err) {
      throw err;
    }
  },

  async findByCode(sessionCode) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM sessions WHERE session_code = ? LIMIT 1',
        [sessionCode]
      );
      return rows[0] || null;
    } catch (err) {
      return null;
    }
  },

  /**
   * Find a session while enforcing ownership by the authenticated kiosk.
   * Older database dumps use `id` as the session code, while newer ones use
   * the explicit `session_code` column. Support both schemas during rollout.
   */
  async findByCodeAndKiosk(sessionCode, kioskId) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM sessions WHERE session_code = ? AND kiosk_id = ? LIMIT 1',
        [sessionCode, kioskId]
      );
      return rows[0] || null;
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;

      const [rows] = await pool.query(
        'SELECT * FROM sessions WHERE id = ? AND kiosk_id = ? LIMIT 1',
        [sessionCode, kioskId]
      );
      return rows[0] || null;
    }
  },
};

module.exports = Session;
