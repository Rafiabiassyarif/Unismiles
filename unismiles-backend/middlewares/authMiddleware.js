const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }

    const [user] = await pool.query(
      "SELECT id, role, partner_name, status FROM users WHERE id = ? LIMIT 1",
      [decoded.id]
    );

    if (user.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found or has been deleted' });
    }

    if (user[0].status && String(user[0].status).toLowerCase() !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is inactive.' });
    }

    req.user = user[0];
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have the required role to access this resource.',
      });
    }
    next();
  };
};

module.exports = { verifyToken, requireRole };
