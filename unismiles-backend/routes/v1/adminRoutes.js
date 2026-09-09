const express = require('express');
const router = express.Router();
const upload = require('../../middlewares/uploadMiddleware');
const { verifyToken } = require('../../middlewares/authMiddleware');
const paymentController = require('../../controllers/paymentController');
const kioskController = require('../../controllers/kioskController');
const dashboardController = require('../../controllers/dashboardController');
const frameTemplateController = require('../../controllers/frameTemplateController');
const sessionController = require('../../controllers/sessionController');
const adminController = require('../../controllers/adminController');
const authMiddleware = require('../../middlewares/authMiddleware');

router.use(verifyToken);

const systemSettingsController = require('../../controllers/systemSettingsController');

router.get('/settings', systemSettingsController.getAdminSettings);
router.put('/settings', systemSettingsController.updateSettings);

router.get('/dashboard', dashboardController.getDashboardStats);

router.get('/payment-profile', paymentController.getAdminPaymentProfile);
router.post('/payment-profile/qris', upload.single('qris_image'), paymentController.uploadAdminQRIS);
router.put('/payment-profile', paymentController.updateAdminPaymentProfile);

router.get('/kiosks', kioskController.getAdminKiosks);
router.post('/kiosks', kioskController.createKiosk);
router.put('/kiosks/:id', kioskController.updateKiosk);
router.delete('/kiosks/:id', kioskController.deleteKiosk);
router.post('/kiosks/:id/regenerate-key', kioskController.regenerateKey);

router.get('/kiosks/:kioskId/printing-config', kioskController.getPrintingConfig);
router.put('/kiosks/:kioskId/printing-config', kioskController.updatePrintingConfig);
router.post('/kiosks/:kioskId/printing-config/test', kioskController.testPrintingConfig);
router.post('/kiosks/:kioskId/printing-config/refresh', kioskController.refreshPrintingConfig);
router.get('/templates', frameTemplateController.getTemplates);
router.post('/templates/generate', frameTemplateController.generateTemplate);
router.post('/templates', upload.single('frame_image'), frameTemplateController.uploadTemplate);
router.put('/templates/:id', frameTemplateController.updateTemplate);
router.delete('/templates/:id', frameTemplateController.deleteTemplate);

const { PaymentVerificationController } = require('../../controllers/paymentVerificationController');

router.get('/sessions', sessionController.getAdminSessions);
router.get('/payment-verifications/attempts', PaymentVerificationController.getAttempts);
router.get('/payment-verifications/attempts/:attempt_id/evidence', PaymentVerificationController.getEvidenceFile);
router.post('/payment-verifications/attempts/:attempt_id/override', PaymentVerificationController.overridePayment);

// Endpoint: POST /api/v1/admin/admin-mitra
router.post(
  '/admin-mitra',
  authMiddleware.requireRole(['Super Admin']),
  adminController.createAdminMitra
);

module.exports = router;
