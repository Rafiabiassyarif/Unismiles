const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get aggregated stats for the admin dashboard
 */
router.get('/stats', dashboardController.getDashboardStats);

module.exports = router;
