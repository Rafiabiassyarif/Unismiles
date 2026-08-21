const express = require('express');
const router = express.Router();
const printController = require('../../controllers/printController');

const kioskAuthMiddleware = require('../../middlewares/kioskAuthMiddleware');

/**
 * @route   POST /api/prints
 * @desc    Insert a new print log from the kiosk (monitor paper rolls)
 */
router.post('/', kioskAuthMiddleware, printController.createPrintLog);

/**
 * @route   GET /api/prints
 * @desc    Get all print logs (optional query ?kiosk_id=...)
 */
router.get('/', printController.getAllPrintLogs);

module.exports = router;
