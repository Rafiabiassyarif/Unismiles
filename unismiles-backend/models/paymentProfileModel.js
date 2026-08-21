const pool = require('../config/db');

const PaymentProfile = {
  async findByUserId(userId) {
    const [rows] = await pool.query(
      'SELECT id, user_id, profile_name, payment_type, provider, display_name, merchant_name, account_name, account_number, payment_data, is_default, status, created_at, updated_at FROM payment_profiles WHERE user_id = ? AND deleted_at IS NULL',
      [userId]
    );
    return rows;
  },

  async findDefaultForKiosk(userId) {
    const [rows] = await pool.query(
      'SELECT id, user_id, profile_name, payment_type, provider, display_name, merchant_name, account_name, account_number, payment_data, is_default, status, created_at, updated_at FROM payment_profiles WHERE user_id = ? AND is_default = 1 AND deleted_at IS NULL LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  },

  async upsertProfile({ user_id, payment_data }) {
    const existing = await this.findDefaultForKiosk(user_id);
    if (existing) {
      const [result] = await pool.query(
        'UPDATE payment_profiles SET payment_data = ? WHERE id = ?',
        [payment_data, existing.id]
      );
      return result;
    } else {
      const [result] = await pool.query(
        "INSERT INTO payment_profiles (user_id, profile_name, payment_type, provider, is_default, status, payment_data) VALUES (?, 'Default QRIS', 'manual_qris', 'manual', 1, 'active', ?)",
        [user_id, payment_data]
      );
      return result;
    }
  }
};

module.exports = PaymentProfile;
