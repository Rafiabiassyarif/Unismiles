const express = require('express');
const router = express.Router();
const gestureController = require('../controllers/gestureController');

const kioskAuthMiddleware = require('../middlewares/kioskAuthMiddleware');

/**
 * @route   GET /api/gestures
 * @desc    Retrieve all gesture logs
 */
router.get('/', gestureController.getAllGestures);

/**
 * @route   POST /api/gestures
 * @desc    Log a new user gesture from the kiosk
 */
router.post('/', kioskAuthMiddleware, gestureController.logGesture);

module.exports = router;
