const db = require('../config/db'); // MySQL connection pool
const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');

/**
 * Controller handling admin‑only actions.
 * Currently provides a method to create a new "Admin Mitra" user.
 */
const adminController = {
  /**
   * Create a new Admin Mitra account.
   * Accessible only by a Super Admin (protected by authMiddleware).
   */
  async createAdminMitra(req, res) {
    try {
      const { full_name, email, password, partner_name } = req.body;

      // ---- basic validation ----
      if (!full_name || !email || !password || !partner_name) {
        return res.status(400).json({ success: false, message: 'Semua field wajib diisi' });
      }

      // ---- prevent duplicate email ----
      const [exists] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
      if (exists.length) {
        return res.status(409).json({ success: false, message: 'Email sudah terdaftar' });
      }

      // ---- hash password ----
      const password_hash = await bcrypt.hash(password, 10);

      // ---- insert new Admin Mitra ----
      const nameColumn = await userModel.getNameColumn();
      const sql = `
        INSERT INTO users (\`${nameColumn}\`, email, password_hash, role, partner_name, status, created_at, updated_at)
        VALUES (?, ?, ?, 'Admin Mitra', ?, 'Active', NOW(), NOW())
      `;
      await db.query(sql, [full_name, email, password_hash, partner_name]);

      return res.status(201).json({ success: true, message: 'Admin Mitra berhasil dibuat' });
    } catch (err) {
      console.error('createAdminMitra error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  },
};

module.exports = adminController;
