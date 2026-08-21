const pool = require('../config/db');

const runDashboardQueries = async (sessionKey, userId, userRole) => {
  const scoped = userRole !== 'Super Admin';
  const kioskFilter = scoped ? ' WHERE user_id = ?' : '';
  const sessionFilter = scoped ? ' AND k.user_id = ?' : '';
  const sessionId = `s.${sessionKey}`;

  const kioskQuery = `SELECT COUNT(id) AS total_kiosks FROM kiosks${kioskFilter}`;
  const statusQuery = `
    SELECT
      SUM(CASE WHEN last_heartbeat IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_heartbeat, NOW()) < 120 THEN 1 ELSE 0 END) AS online_kiosks,
      SUM(CASE WHEN last_heartbeat IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_heartbeat, NOW()) BETWEEN 120 AND 599 THEN 1 ELSE 0 END) AS idle_kiosks,
      SUM(CASE WHEN last_heartbeat IS NULL OR TIMESTAMPDIFF(SECOND, last_heartbeat, NOW()) >= 600 THEN 1 ELSE 0 END) AS offline_kiosks
    FROM kiosks${scoped ? ' WHERE user_id = ?' : ''}
  `;
  const sessionQuery = `
    SELECT COUNT(${sessionId}) AS total_sessions
    FROM sessions s
    JOIN kiosks k ON s.kiosk_id = k.id
    WHERE s.status = 'completed'${sessionFilter}
  `;
  const revenueQuery = `
    SELECT COALESCE(SUM(t.amount), 0) AS total_revenue
    FROM transactions t
    JOIN sessions s ON t.session_id = ${sessionId}
    JOIN kiosks k ON s.kiosk_id = k.id
    WHERE t.status = 'success'${sessionFilter}
  `;

  const [[{ total_kiosks }]] = await pool.query(kioskQuery, scoped ? [userId] : []);
  const [[statusRow]] = await pool.query(statusQuery, scoped ? [userId] : []);
  const [[{ total_sessions }]] = await pool.query(sessionQuery, scoped ? [userId] : []);
  const [[{ total_revenue }]] = await pool.query(revenueQuery, scoped ? [userId] : []);

  return {
    total_kiosks: Number(total_kiosks) || 0,
    total_sessions: Number(total_sessions) || 0,
    total_revenue: Number(total_revenue) || 0,
    online_kiosks: Number(statusRow?.online_kiosks) || 0,
    idle_kiosks: Number(statusRow?.idle_kiosks) || 0,
    offline_kiosks: Number(statusRow?.offline_kiosks) || 0,
  };
};

const getDashboardStats = async (req, res) => {
  try {
    const user_id = req.user.id;
    const user_role = req.user.role;

    let data;
    try {
      data = await runDashboardQueries('session_code', user_id, user_role);
    } catch (error) {
      if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;
      // Older SQL dumps use sessions.id as the session identifier.
      data = await runDashboardQueries('id', user_id, user_role);
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDashboardStats
};
