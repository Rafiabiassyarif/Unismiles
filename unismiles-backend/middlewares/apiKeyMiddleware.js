const pool = require('../config/db.js');

const verifyApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({ success: false, message: 'API Key is missing' });
    }

    const [result] = await pool.query('SELECT * FROM kiosks WHERE api_key = ? LIMIT 1', [apiKey]);

    if (result.length === 0) {
      return res.status(403).json({ success: false, message: 'Invalid or revoked API Key' });
    }

    req.kiosk = result[0];
    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = verifyApiKey;
