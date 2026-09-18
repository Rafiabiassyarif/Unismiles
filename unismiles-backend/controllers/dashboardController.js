const pool = require('../config/db');

/**
 * Satu definisi "sesi sukses" untuk seluruh angka dashboard.
 *
 * Sebelumnya Total Revenue dan Total Sessions dihitung dari tabel yang berbeda
 * dengan syarat yang berbeda: revenue menjumlahkan SEMUA transaksi berstatus
 * 'success', sementara sessions hanya menghitung sesi berstatus 'completed'.
 * Akibatnya revenue ikut menjumlahkan sesi yang tidak pernah selesai (mis.
 * pembayaran terverifikasi tetapi sesi tetap 'active' tanpa foto), sehingga
 * kedua kartu saling bertentangan.
 *
 * Definisi ini sama dengan label "Success" pada halaman Sessions
 * (sessionController.getAdminSessions memetakan status 'completed' -> 'Success').
 */
const SUCCESS_SESSION_PREDICATE = "s.status = 'completed'";

const buildDashboardQueries = (sessionKey, userId, userRole) => {
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

  // Kedua angka memakai tabel sessions dengan predikat yang sama, jadi tidak
  // mungkin lagi saling bertentangan. Nominal diambil dari
  // payment_required_amount, yaitu jumlah yang benar-benar dibayar pelanggan
  // (harga frame Admin + kode unik) dan sudah dipastikan cocok oleh verifikasi.
  const sessionQuery = `
    SELECT COUNT(${sessionId}) AS total_sessions
    FROM sessions s
    JOIN kiosks k ON s.kiosk_id = k.id
    WHERE ${SUCCESS_SESSION_PREDICATE}${sessionFilter}
  `;
  const revenueQuery = `
    SELECT COALESCE(SUM(COALESCE(s.payment_required_amount, 0)), 0) AS total_revenue
    FROM sessions s
    JOIN kiosks k ON s.kiosk_id = k.id
    WHERE ${SUCCESS_SESSION_PREDICATE}${sessionFilter}
  `;

  return {
    kioskQuery,
    statusQuery,
    sessionQuery,
    revenueQuery,
    params: scoped ? [userId] : [],
  };
};

const runDashboardQueries = async (sessionKey, userId, userRole) => {
  const queries = buildDashboardQueries(sessionKey, userId, userRole);
  const { params } = queries;

  const [[{ total_kiosks }]] = await pool.query(queries.kioskQuery, params);
  const [[statusRow]] = await pool.query(queries.statusQuery, params);
  const [[{ total_sessions }]] = await pool.query(queries.sessionQuery, params);
  const [[{ total_revenue }]] = await pool.query(queries.revenueQuery, params);

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
  getDashboardStats,
  buildDashboardQueries,
  SUCCESS_SESSION_PREDICATE,
};
