const express = require('express');
const router = express.Router();
const systemSettingsController = require('../../controllers/systemSettingsController');

router.get('/settings', systemSettingsController.getPublicConfig);

module.exports = router;
