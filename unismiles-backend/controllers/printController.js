const printModel = require('../models/printModel');

/**
 * Print Controller
 * Handles HTTP requests/responses for Print Log endpoints.
 */
const printController = {
  /**
   * @desc    Insert a new print log from the kiosk
   * @route   POST /api/prints
   * @access  Public (or Kiosk)
   */
  createPrintLog: async (req, res, next) => {
    try {
      const { kiosk_id, session_id, status, paper_stock_left } = req.body;

      if (!kiosk_id || !session_id || !status || paper_stock_left === undefined) {
        res.status(400);
        throw new Error('Please provide all required fields: kiosk_id, session_id, status, paper_stock_left');
      }

      if (status !== 'success' && status !== 'failed') {
        res.status(400);
        throw new Error('status must be either "success" or "failed"');
      }

      if (isNaN(paper_stock_left)) {
        res.status(400);
        throw new Error('paper_stock_left must be a number.');
      }

      const newLog = await printModel.createPrintLog({
        kiosk_id,
        session_id,
        status,
        paper_stock_left: parseInt(paper_stock_left, 10)
      });

      return res.status(201).json({
        success: true,
        message: 'Print log recorded successfully.',
        data: newLog
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Get all print logs
   * @route   GET /api/prints
   * @access  Public (or Admin)
   */
  getAllPrintLogs: async (req, res, next) => {
    try {
      const { kiosk_id } = req.query;
      let logs;

      if (kiosk_id) {
        logs = await printModel.getPrintLogsByKiosk(kiosk_id);
      } else {
        logs = await printModel.getAllPrintLogs();
      }

      return res.status(200).json({
        success: true,
        count: logs.length,
        data: logs
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = printController;
