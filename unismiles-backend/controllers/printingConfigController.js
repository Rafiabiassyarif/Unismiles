const crypto = require('crypto');
const kioskModel = require('../models/kioskModel');
const printingConfigModel = require('../models/kioskPrintingConfigModel');
const auditLogModel = require('../models/auditLogModel');
const printJobModel = require('../models/printJobModel');
const { sendKioskCommand, isKioskConnected } = require('../utils/socketServer');
const { schedulePrintJobTimeout } = require('../utils/printJobLifecycle');
const {
  validatePrintingConfig,
  PrintingConfigValidationError,
  toSocketPrintingConfig,
} = require('../utils/printingConfigValidation');

function safeMessage(error) {
  return error instanceof PrintingConfigValidationError ? error.message : 'Unable to process printing configuration.';
}

function responseData(row) {
  const formatted = printingConfigModel.format(row);
  return {
    config: formatted.config,
    reported: formatted.reported,
    status: formatted.status,
  };
}

function trustedTestImageUrl() {
  const base = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || process.env.SERVER_URL;
  if (!base) {
    throw new Error('PUBLIC_BASE_URL must be configured for test print image URL');
  }
  return `${base.replace(/\/$/, '')}/uploads/assets/1785469532478-449116365.png`;
}

function canAccessKiosk(user, kiosk) {
  return user?.role === 'Super Admin' || user?.role === 'admin' || String(kiosk?.user_id) === String(user?.id);
}

const controller = {
  async get(req, res, next) {
    try {
      const kiosk = await kioskModel.getKioskById(req.params.kioskId);
      if (!kiosk) return res.status(404).json({ success: false, message: 'Kiosk not found.' });
      if (!canAccessKiosk(req.user, kiosk)) return res.status(404).json({ success: false, message: 'Kiosk not found.' });
      const row = await printingConfigModel.getOrCreate(kiosk.id);
      return res.status(200).json({ success: true, kioskId: kiosk.id, data: responseData(row) });
    } catch (error) { return next(error); }
  },

  async update(req, res, next) {
    try {
      const kiosk = await kioskModel.getKioskById(req.params.kioskId);
      if (!kiosk) return res.status(404).json({ success: false, message: 'Kiosk not found.' });
      if (!canAccessKiosk(req.user, kiosk)) return res.status(404).json({ success: false, message: 'Kiosk not found.' });

      const current = await printingConfigModel.getOrCreate(kiosk.id);
      const currentFormatted = printingConfigModel.format(current);
      const normalized = validatePrintingConfig(req.body, current, currentFormatted.reported);
      const updated = await printingConfigModel.updateDesired(kiosk.id, normalized, req.user?.id);
      const sent = require('../utils/socketServer').pushPrintingConfig(kiosk.id, toSocketPrintingConfig(updated));

      await auditLogModel.create({
        userId: req.user?.id,
        action: 'kiosk.printing_config.updated',
        resourceType: 'kiosk_printing_config',
        resourceId: kiosk.id,
        metadata: { config_version: Number(updated.config_version), adapter: normalized.adapter, printing_enabled: normalized.printing_enabled, dispatched: sent },
      });

      return res.status(200).json({
        success: true,
        message: sent ? 'Printing configuration saved and sent to kiosk.' : 'Printing configuration saved as pending for kiosk reconnect.',
        kioskId: kiosk.id,
        agentNotified: sent,
        data: responseData(updated),
      });
    } catch (error) {
      if (error instanceof PrintingConfigValidationError) {
        return res.status(error.statusCode).json({ success: false, message: safeMessage(error), error_code: error.code });
      }
      return next(error);
    }
  },

  async refresh(req, res, next) {
    try {
      const kiosk = await kioskModel.getKioskById(req.params.kioskId);
      if (!kiosk) return res.status(404).json({ success: false, message: 'Kiosk not found.' });
      if (!canAccessKiosk(req.user, kiosk)) return res.status(404).json({ success: false, message: 'Kiosk not found.' });
      const sent = sendKioskCommand(kiosk.id, 'REFRESH_PRINTER_STATUS', {});
      return res.status(sent ? 200 : 503).json({
        success: sent,
        message: sent ? 'Printer status refresh requested.' : 'Kiosk is currently offline.',
        error_code: sent ? undefined : 'KIOSK_OFFLINE',
      });
    } catch (error) { return next(error); }
  },

  async test(req, res, next) {
    try {
      const kiosk = await kioskModel.getKioskById(req.params.kioskId);
      if (!kiosk) return res.status(404).json({ success: false, message: 'Kiosk not found.' });
      if (!canAccessKiosk(req.user, kiosk)) return res.status(404).json({ success: false, message: 'Kiosk not found.' });
      const row = await printingConfigModel.getOrCreate(kiosk.id);
      const config = printingConfigModel.format(row).config;
      if (!config.printing_enabled || config.adapter === 'disabled' || !config.printer_name) {
        return res.status(400).json({ success: false, message: 'Printing must be enabled with a valid printer before testing.', error_code: 'PRINTING_NOT_READY' });
      }
      if (!isKioskConnected(kiosk.id)) {
        return res.status(503).json({ success: false, message: 'Kiosk is currently offline.', error_code: 'KIOSK_OFFLINE' });
      }

      const jobId = crypto.randomUUID();
      const sessionCode = `ADMIN-TEST-${jobId}`;
      const job = await printJobModel.create({
        job_id: jobId,
        kiosk_id: kiosk.id,
        session_id: sessionCode,
        session_code: sessionCode,
        image_url: trustedTestImageUrl(),
        copies: 1,
        paper_size: config.paper_size,
        orientation: config.orientation,
        idempotency_key: `admin-test:${jobId}`,
      });

      schedulePrintJobTimeout(jobId, kiosk.id);
      const dispatched = sendKioskCommand(kiosk.id, 'PRINT_PHOTO', {
        job_id: jobId,
        session_code: sessionCode,
        image_url: job.image_url,
        copies: 1,
        paper_size: config.paper_size,
        orientation: config.orientation,
      });
      if (!dispatched) {
        const failed = await printJobModel.markFailedIfPending(jobId, kiosk.id, 'KIOSK_OFFLINE', 'Kiosk disconnected before the test print was dispatched.');
        return res.status(503).json({ success: false, message: 'Kiosk is currently offline.', error_code: 'KIOSK_OFFLINE', data: printJobModel.formatPrintJob(failed || job) });
      }

      await auditLogModel.create({
        userId: req.user?.id,
        action: 'kiosk.printing_config.test_print',
        resourceType: 'print_job',
        resourceId: jobId,
        metadata: { kiosk_id: kiosk.id, config_version: config.config_version, copies: 1, command: 'PRINT_PHOTO' },
      });
      return res.status(202).json({ success: true, message: 'Test print queued.', data: printJobModel.formatPrintJob(job) });
    } catch (error) { return next(error); }
  },
};

module.exports = controller;
