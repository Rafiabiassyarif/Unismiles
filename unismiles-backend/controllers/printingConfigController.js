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

  /**
   * Laporan status printer dari browser kiosk (Web Bluetooth).
   *
   * Hanya browser yang tahu status printer label NIIMBOT: printer itu tidak
   * muncul sebagai printer sistem, jadi kiosk-agent tidak bisa melaporkannya.
   *
   * Nilai yang diterima dibatasi ketat — endpoint ini memakai kunci kiosk, dan
   * data dari browser tidak boleh bisa menulis apa pun selain status printer.
   */
  async reportFromBrowser(req, res, next) {
    try {
      const kioskId = req.kiosk?.id;
      if (!kioskId) return res.status(401).json({ success: false, message: 'Kiosk identity required.' });

      const body = req.body || {};
      const status = typeof body.status === 'string' ? body.status.slice(0, 30) : null;
      const printerName = typeof body.printer_name === 'string' ? body.printer_name.slice(0, 255) : null;
      const paperStatus = typeof body.paper_status === 'string' ? body.paper_status.slice(0, 30) : null;
      const lastError = typeof body.last_error === 'string' ? body.last_error.slice(0, 255) : null;

      // Daftar status yang bermakna bagi panel Admin. Nilai lain ditolak supaya
      // panel tidak menampilkan apa pun yang tidak dikenal.
      const ALLOWED_STATUS = ['READY', 'OFFLINE', 'ERROR', 'UNKNOWN'];
      if (status && !ALLOWED_STATUS.includes(status)) {
        return res.status(400).json({ success: false, message: `status must be one of: ${ALLOWED_STATUS.join(', ')}.` });
      }

      const row = await printingConfigModel.getOrCreate(kioskId);
      const current = printingConfigModel.format(row);

      // config_version dari laporan ini harus sama dengan versi konfigurasi yang
      // melayani, supaya panel Admin menandai "Applied" dengan benar.
      await printingConfigModel.updateReported(kioskId, {
        config_version: current.config.config_version,
        adapter: current.reported?.adapter || current.config.adapter,
        printer_name: printerName,
        status,
        paper_status: paperStatus,
        prints_remaining: current.reported?.prints_remaining ?? null,
        last_print_error: lastError,
        supported_adapters: current.reported?.supported_adapters || [],
        available_printers: current.reported?.available_printers || [],
        reported_at: new Date(),
      });

      return res.status(200).json({ success: true, message: 'Printer status recorded.' });
    } catch (error) { return next(error); }
  },

  /**
   * Pengaturan cetak untuk KIOSK itu sendiri (bukan untuk admin).
   *
   * Kenapa endpoint ini perlu ada: konfigurasi cetak dikirim ke kiosk lewat
   * WebSocket, yang hanya hidup kalau kiosk-agent berjalan. Photobooth yang
   * mencetak langsung lewat Web Bluetooth tidak punya jalur lain untuk membaca
   * ukuran kertas, kepekatan, dan geser vertikal dari Admin — akibatnya
   * pengaturan itu hanya bisa diubah lewat halaman uji, bukan lewat Admin.
   *
   * Yang dikembalikan hanya nilai yang dibutuhkan untuk mencetak. Tidak ada
   * kredensial, tidak ada daftar printer, tidak ada apa pun yang bisa dipakai
   * untuk mengubah konfigurasi — endpoint ini hanya membaca.
   */
  async getForKiosk(req, res, next) {
    try {
      const kioskId = req.kiosk?.id;
      if (!kioskId) return res.status(401).json({ success: false, message: 'Kiosk identity required.' });

      const row = await printingConfigModel.getOrCreate(kioskId);
      const { config } = printingConfigModel.format(row);

      return res.status(200).json({
        success: true,
        data: {
          paper_size: config.paper_size,
          orientation: config.orientation,
          copies_limit: config.copies_limit,
          adapter: config.adapter,
          printing_enabled: config.enabled,
          printer_name: config.printer_name,
          photo_brightness: config.photo_brightness,
          photo_contrast: config.photo_contrast,
          photo_saturation: config.photo_saturation,
          thermal_density: config.thermal_density,
          thermal_offset_y_px: config.thermal_offset_y_px,
          photo_fit_mode: config.photo_fit_mode,
          config_version: config.config_version,
        },
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
