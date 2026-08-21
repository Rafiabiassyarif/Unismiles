const express = require('express');
const router = express.Router();
const photoController = require('../controllers/photoController');
const upload = require('../middlewares/uploadMiddleware');

const kioskAuthMiddleware = require('../middlewares/kioskAuthMiddleware');

/**
 * @route   POST /api/photos
 * @desc    Upload a photo for a session
 *          Requires multipart/form-data with a file field named "photo"
 *          and a text field "session_id"
 */
router.post('/', kioskAuthMiddleware, upload.single('photo'), photoController.uploadPhoto);

/**
 * @route   GET /api/photos/session/:sessionId
 * @desc    Get all photos associated with a specific session
 */
router.get('/session/:sessionId', photoController.getPhotos);

module.exports = router;
