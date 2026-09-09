const express = require('express');
const router = express.Router();
const upload = require('../../middlewares/uploadMiddleware');

const verifyApiKey = require('../../middlewares/apiKeyMiddleware');
const sessionController = require('../../controllers/sessionController');
const photoController = require('../../controllers/photoController');
const paymentController = require('../../controllers/paymentController');

const kioskController = require('../../controllers/kioskController');
const printJobController = require('../../controllers/printJobController');
const { createRateLimiter } = require('../../utils/security');

router.use(verifyApiKey);

router.get('/connection', (req, res) => {
  return res.status(200).json({
    success: true,
    data: { kiosk_id: req.kiosk.id }
  });
});

/**
 * POST /api/v1/kiosk/heartbeat
 * Hardware kiosk calls this every ~60 seconds to report it is alive.
 * Body: { printerInk, storage, camera }
 */
router.post('/heartbeat', kioskController.heartbeat);

const { PaymentVerificationController, uploadMemory } = require('../../controllers/paymentVerificationController');

router.get('/payments', paymentController.getKioskPaymentMethods);
router.get('/templates', kioskController.getKioskTemplates);
router.post('/sessions/start', sessionController.startSession);
router.post('/sessions/:session_code/payment', sessionController.verifyPayment);
router.post('/sessions/:session_code/payment-verifications', uploadMemory, PaymentVerificationController.submitEvidence);
router.get('/sessions/:session_code/payment-verifications/:attempt_id', PaymentVerificationController.checkAttempt);
router.post('/sessions/:session_code/photos', upload.single('photo'), photoController.uploadPhoto);
router.put('/sessions/:session_code/complete', sessionController.completeSession);
router.post('/sessions/:session_code/send-email', createRateLimiter({ windowMs: 10 * 60_000, max: 3, keyGenerator: req => `${req.kiosk?.id || 'unknown'}:${req.ip}` }), sessionController.sendDigitalCopy);
router.post('/sessions/:session_code/print', printJobController.createPrintJob);
router.get('/print-jobs/:job_id', printJobController.getPrintJob);

module.exports = router;
