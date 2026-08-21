const express = require('express');
const router = express.Router();
const frameTemplateController = require('../controllers/frameTemplateController');
const upload = require('../middlewares/uploadMiddleware');

/**
 * @route   GET /api/frame_templates
 * @desc    Retrieve all frame templates
 */
router.get('/', frameTemplateController.getAllTemplates);

/**
 * @route   GET /api/frame_templates/:id
 * @desc    Retrieve a specific frame template by ID
 */
router.get('/:id', frameTemplateController.getTemplateById);

/**
 * @route   POST /api/frame_templates/upload
 * @desc    Upload PNG frame template image
 */
router.post('/upload', upload.single('image'), frameTemplateController.uploadTemplateImage);

/**
 * @route   POST /api/frame_templates
 * @desc    Create a new frame template
 */
router.post('/', frameTemplateController.createTemplate);

/**
 * @route   PUT /api/frame_templates/:id
 * @desc    Update a specific frame template by ID
 */
router.put('/:id', frameTemplateController.updateTemplate);

/**
 * @route   DELETE /api/frame_templates/:id
 * @desc    Delete a specific frame template by ID
 */
router.delete('/:id', frameTemplateController.deleteTemplate);

module.exports = router;
