const pool = require('../config/db');

const kioskAuth = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({ success: false, message: 'API Key is missing' });
    }

    const [kiosk] = await pool.query(
      'SELECT id, location, base_price, status, user_id FROM kiosks WHERE api_key = ? AND deleted_at IS NULL LIMIT 1',
      [apiKey]
    );

    if (kiosk.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid API Key or Kiosk has been deleted' });
    }

    if (kiosk[0].status === 'offline') {
      return res.status(403).json({ success: false, message: 'Kiosk is currently offline' });
    }

    req.kiosk = kiosk[0];
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = kioskAuth;
