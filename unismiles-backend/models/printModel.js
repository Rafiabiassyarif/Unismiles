const pool = require('../config/db');

/**
 * Print Model
 * Handles database operations for the `print_logs` table.
 */
const printModel = {
  /**
   * Insert a new print log from the kiosk
   * @param {Object} printData - Print log details
   * @returns {Promise<Object>} Created print log record
   */
  createPrintLog: async (printData) => {
    const { kiosk_id, session_id, status, paper_stock_left } = printData;

    const [result] = await pool.query(
      'INSERT INTO print_logs (kiosk_id, session_id, status, paper_stock_left) VALUES (?, ?, ?, ?)',
      [kiosk_id, session_id, status, paper_stock_left]
    );

    return {
      id: result.insertId,
      kiosk_id,
      session_id,
      status,
      paper_stock_left
    };
  },

  /**
   * Get all print logs from the database
   * @returns {Promise<Array>} List of print logs
   */
  getAllPrintLogs: async () => {
    const [rows] = await pool.query('SELECT * FROM print_logs ORDER BY id DESC');
    return rows;
  },

  /**
   * Get print logs for a specific kiosk
   * @param {string|number} kioskId 
   * @returns {Promise<Array>} List of print logs for the kiosk
   */
  getPrintLogsByKiosk: async (kioskId) => {
    const [rows] = await pool.query('SELECT * FROM print_logs WHERE kiosk_id = ? ORDER BY id DESC', [kioskId]);
    return rows;
  }
};

module.exports = printModel;
