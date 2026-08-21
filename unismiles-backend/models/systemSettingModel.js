const pool = require('../config/db');

const SystemSetting = {
  async getPublicSettings() {
    const [rows] = await pool.query(
      'SELECT setting_key, setting_value, value_type FROM system_settings WHERE is_public = 1'
    );
    return rows;
  },

  async getAllSettings() {
    const [rows] = await pool.query(
      'SELECT id, setting_group, setting_key, setting_value, value_type, description, is_public, updated_by, created_at, updated_at FROM system_settings'
    );
    return rows;
  },

  async updateSetting(key, value) {
    const [result] = await pool.query(
      'UPDATE system_settings SET setting_value = ? WHERE setting_key = ?',
      [value, key]
    );
    return result;
  },
};

module.exports = SystemSetting;
