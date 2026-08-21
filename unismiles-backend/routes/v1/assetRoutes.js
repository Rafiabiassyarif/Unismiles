const express = require('express');
const router = express.Router();
const upload = require('../../middlewares/assetUploadMiddleware');
const { verifyToken } = require('../../middlewares/authMiddleware');
const controller = require('../../controllers/assetController');
const { requireRole } = require('../../middlewares/authMiddleware');

router.use(verifyToken);
router.get('/', controller.getAssets);
router.post('/', requireRole(['Super Admin', 'Admin Mitra', 'admin', 'admin_mitra']), upload.single('asset'), controller.uploadAsset);
router.delete('/:id', requireRole(['Super Admin', 'Admin Mitra', 'admin', 'admin_mitra']), controller.deleteAsset);

module.exports = router;
