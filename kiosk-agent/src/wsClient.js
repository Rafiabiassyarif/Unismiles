const { io } = require('socket.io-client');
const hardware = require('./hardware');
const logger = require('./logger');
const { downloadImage, cleanupDownloadedImage } = require('./imageDownloader');
const { createPrinterAdapter, supportedAdapters, discoverPrinters, SUPPORTED_ADAPTER_NAMES } = require('./printerAdapterFactory');
const { isSupportedPaperSize } = require('./paperSizes');

/**
 * WebSocket & Socket.IO Client Manager for Kiosk Agent
 * Manages persistent connection to Backend, auto-reconnect, 20s heartbeat,
 * and remote command dispatch.
 */
class KioskWSClient {
  constructor({
    backendUrl,
    deviceId,
    deviceToken,
    heartbeatIntervalMs = 20000,
    onConfigChange,
    printerAdapter,
    printerConfig = {},
    fetchImpl,
  }) {
    this.backendUrl = backendUrl;
    this.deviceId = deviceId;
    this.deviceToken = deviceToken;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.onConfigChange = onConfigChange;
    this.printerAdapter = printerAdapter;
    const configuredAdapter = printerConfig.adapter || (printerAdapter ? 'mock' : 'disabled');
    this.printerConfig = {
      enabled: Boolean(printerConfig.enabled ?? Boolean(printerConfig.printerName)),
      adapter: configuredAdapter,
      printerName: printerConfig.printerName || null,
      paperSize: printerConfig.paperSize || '4R',
      orientation: printerConfig.orientation || 'portrait',
      copiesLimit: printerConfig.copiesLimit || 1,
      timeoutMs: printerConfig.timeoutMs || 60000,
      maxImageBytes: printerConfig.maxImageBytes || 15 * 1024 * 1024,
      retryCount: printerConfig.retryCount || 2,
      // Kalibrasi cetak + penyesuaian tampilan (dari Admin, lewat backend).
      photoBrightness: printerConfig.photoBrightness ?? 100,
      photoContrast: printerConfig.photoContrast ?? 100,
      photoSaturation: printerConfig.photoSaturation ?? 100,
      thermalDensity: printerConfig.thermalDensity ?? 3,
      thermalOffsetYPx: printerConfig.thermalOffsetYPx ?? 0,
      photoFitMode: printerConfig.photoFitMode || 'fit',
    };
    this.fetchImpl = fetchImpl;
    this.availablePrinters = [];

    this.socket = null;
    this.heartbeatTimer = null;
    this.isConnected = false;

    this.reportedState = {
      brightness: 80,
      volume: 100,
      maintenanceMode: false,
      resolution: '1080x1920',
      paperSize: '4x6',
      // Nilai netral sampai Admin mengirim konfigurasi cetak.
      photoBrightness: 100,
      photoContrast: 100,
      photoSaturation: 100,
      thermalDensity: 3,
      thermalOffsetYPx: 0,
      photoFitMode: 'fit',
      printerStatus: 'UNKNOWN',
      lastPrintError: null,
      printing: {
        enabled: this.printerConfig.enabled,
        adapter: this.printerConfig.adapter,
        printer_name: this.printerConfig.printerName,
        config_version: 0,
        status: 'UNKNOWN',
        paper_status: 'UNKNOWN',
        prints_remaining: null,
        last_print_error: null,
      },
    };

    this.printJobs = new Map();
    this.activePrintJobId = null;
    this.activePrintPromise = null;
  }

  /**
   * Initializes persistent Socket.IO connection to backend /kiosk namespace.
   */
  connect() {
    const namespaceUrl = `${this.backendUrl.replace(/\/$/, '')}/kiosk`;
    console.log(`[WSClient] Connecting to Backend WebSocket: ${namespaceUrl}`);

    this.socket = io(namespaceUrl, {
      auth: {
        token: this.deviceToken,
        apiKey: this.deviceToken,
        deviceId: this.deviceId,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
    });

    this.initSocketEvents();
  }

  /**
   * Disconnects the current socket and reconnects with new credentials.
   * Does not close the printer adapter.
   */
  async reconnect({ backendUrl, deviceId, deviceToken }) {
    console.log('[WSClient] Hot-reloading connection with new credentials...');
    if (backendUrl) this.backendUrl = backendUrl;
    if (deviceId) this.deviceId = deviceId;
    if (deviceToken) this.deviceToken = deviceToken;

    this.stopHeartbeatLoop();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;

    this.connect();
  }

  initSocketEvents() {
    // 1. Connection Event & Handshake
    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log(`[WSClient] Connected successfully to Backend (Socket ID: ${this.socket.id})`);
      this.startHeartbeatLoop();
      this.reportPrintingState().catch((error) => logger.warn('printer_state_report_failed', { errorCode: error.code || 'STATUS_FAILED' }));
    });

    // Handshake Ack from Backend
    this.socket.on('kiosk:handshake_ack', async (data) => {
      logger.info('kiosk_handshake_acknowledged', { hasConfig: Boolean(data && data.config) });
      if (data.config) {
        try { await this.handleConfigUpdate(data.config); }
        catch (error) { logger.error('kiosk_config_apply_failed', { errorCode: error.code || 'CONFIG_APPLY_FAILED', message: error.message }); }
      }
    });

    // Heartbeat Ack from Backend
    this.socket.on('kiosk:heartbeat_ack', (data) => {
      // Heartbeat pulse acknowledged
    });

    // 2. Command Event Listener (Backend -> Kiosk Agent)
    this.socket.on('kiosk:command', async (cmdData = {}) => {
      logger.info('kiosk_command_received', {
        command: cmdData.command,
        commandId: cmdData.commandId,
        jobId: cmdData.payload && cmdData.payload.job_id,
      });
      await this.processCommand(cmdData);
    });

    // 3. Direct Config Update Event Listener
    this.socket.on('kiosk:config_update', async (data = {}) => {
      logger.info('kiosk_config_update_received', { hasConfig: Boolean(data && data.config) });
      if (data.config) {
        try { await this.handleConfigUpdate(data.config); }
        catch (error) { logger.error('kiosk_config_apply_failed', { errorCode: error.code || 'CONFIG_APPLY_FAILED', message: error.message }); }
      }
    });

    // 4. Disconnect & Reconnect Handling
    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.warn(`[WSClient] Disconnected from Backend (Reason: ${reason}). Auto-reconnecting...`);
      this.stopHeartbeatLoop();
    });

    this.socket.on('connect_error', (error) => {
      console.error(`[WSClient] Connection error: ${error.message}. Retrying...`);
    });

    this.socket.on('reconnect_attempt', (attempt) => {
      console.log(`[WSClient] Reconnection attempt #${attempt}...`);
    });
  }

  /**
   * Heartbeat Loop (Runs every 20 seconds)
   * Sends inkLevel, storageUsedPercent, cameraStatus, paperStatus.
   */
  startHeartbeatLoop() {
    this.stopHeartbeatLoop();
    console.log(`[WSClient] Starting 20s heartbeat telemetry loop...`);

    // Immediate initial heartbeat
    this.sendHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  stopHeartbeatLoop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async sendHeartbeat() {
    if (!this.socket || !this.isConnected) return;

    await this.refreshPrinterTelemetry();
    const storageUsedPercent = await hardware.getStorageUsedPercent();
    const cameraStatus = await hardware.getCameraStatus();
    const inkLevel = hardware.getInkLevel();

    const payload = {
      deviceId: this.deviceId,
      inkLevel,
      printerInk: inkLevel,
      storageUsedPercent,
      storage: storageUsedPercent,
      cameraStatus,
      camera: cameraStatus,
      paperStatus: hardware.paperStatus,
      printsRemaining: hardware.printsRemaining,
      printerStatus: hardware.getPrinterStatus(),
      lastPrintError: hardware.lastPrinterError,
      printing: this.reportedState.printing,
      supported_adapters: supportedAdapters(),
      available_printers: this.availablePrinters,
      timestamp: new Date().toISOString(),
    };

    this.socket.emit('kiosk:heartbeat', payload);
    this.socket.emit('heartbeat', payload);
  }

  /**
   * SECURITY: Whitelisted commands — only these are allowed to execute.
   * Any command not in this list is immediately rejected and reported.
   */
  static ALLOWED_COMMANDS = [
    'CAMERA_SELF_TEST',
    'PRINTER_CLEAN',
    'REBOOT',
    'SHUTDOWN',
    'SYNC_CONFIG',
    'UPDATE_CONFIG',
    'REFRESH_PRINTER_STATUS',
    'PRINT_PHOTO',
  ];

  /**
   * Command Execution Processor (with whitelist & rate-limit guard)
   */
  async processCommand(cmdData) {
    const { command, commandId, payload = {} } = cmdData;

    if (command === 'PRINT_PHOTO') {
      await this.processPrintPhotoCommand({ commandId, payload });
      return;
    }

    // ── SECURITY GATE 1: Whitelist check ──
    if (!KioskWSClient.ALLOWED_COMMANDS.includes(command)) {
      console.warn(`[SECURITY] ⛔ Rejected unauthorized command: "${command}"`);
      this.socket.emit('kiosk:command_result', {
        commandId,
        command,
        status: 'REJECTED',
        error: 'Command not in whitelist',
      });
      return;
    }

    // ── SECURITY GATE 2: Rate-limit lock (one command at a time) ──
    if (this._commandLock) {
      console.warn(`[WSClient] Command "${command}" dropped — another command is still executing.`);
      this.socket.emit('kiosk:command_result', {
        commandId,
        command,
        status: 'DROPPED',
        error: 'Another command is currently executing',
      });
      return;
    }

    this._commandLock = true;
    try {
      console.log(`[WSClient] Executing whitelisted command: ${command}`);

      if (command === 'CAMERA_SELF_TEST') {
        const testResult = await hardware.runCameraSelfTest();
        this.socket.emit('kiosk:command_result', {
          commandId,
          command: 'CAMERA_SELF_TEST',
          status: testResult.success ? 'SUCCESS' : 'ERROR',
          data: testResult,
        });
        console.log('[WSClient] CAMERA_SELF_TEST completed and result reported to backend.');

      } else if (command === 'UPDATE_CONFIG') {
        await this.handleConfigUpdate(payload);
        this.socket.emit('kiosk:command_result', {
          commandId,
          command: 'UPDATE_CONFIG',
          status: 'SUCCESS',
          reportedState: this.reportedState,
        });

      } else if (command === 'REBOOT') {
        console.log('[WSClient] ⚠️ REBOOT command received — scheduling system reboot...');
        this.socket.emit('kiosk:command_result', {
          commandId,
          command: 'REBOOT',
          status: 'SUCCESS',
          data: { message: 'Reboot initiated' },
        });
        // Delay reboot by 3s to allow the result to be sent
        setTimeout(() => {
          try {
            hardware.systemReboot();
          } catch (err) {
            console.error('[WSClient] Reboot failed:', err.message);
          }
        }, 3000);

      } else if (command === 'SHUTDOWN') {
        console.log('[WSClient] ⚠️ SHUTDOWN command received — scheduling system shutdown...');
        this.socket.emit('kiosk:command_result', {
          commandId,
          command: 'SHUTDOWN',
          status: 'SUCCESS',
          data: { message: 'Shutdown initiated' },
        });
        setTimeout(() => {
          try {
            hardware.systemShutdown();
          } catch (err) {
            console.error('[WSClient] Shutdown failed:', err.message);
          }
        }, 3000);

      } else if (command === 'PRINTER_CLEAN') {
        console.log('[WSClient] PRINTER_CLEAN command received...');
        const cleanResult = hardware.runPrinterClean();
        this.socket.emit('kiosk:command_result', {
          commandId,
          command: 'PRINTER_CLEAN',
          status: cleanResult.success ? 'SUCCESS' : 'ERROR',
          data: cleanResult,
        });

      } else if (command === 'REFRESH_PRINTER_STATUS') {
        await this.reportPrintingState(this.reportedState.printing.config_version);
        this.socket.emit('kiosk:command_result', {
          commandId,
          command: 'REFRESH_PRINTER_STATUS',
          status: 'SUCCESS',
          printing: this.reportedState.printing,
        });

      } else if (command === 'SYNC_CONFIG') {
        console.log('[WSClient] SYNC_CONFIG command received — requesting full config refresh...');
        await this.handleConfigUpdate(payload);
        this.socket.emit('kiosk:command_result', {
          commandId,
          command: 'SYNC_CONFIG',
          status: 'SUCCESS',
          reportedState: this.reportedState,
        });
      }

    } catch (err) {
      console.error(`[WSClient] Command "${command}" execution failed:`, err.message);
      this.socket.emit('kiosk:command_result', {
        commandId,
        command,
        status: 'ERROR',
        error: err.message,
      });
    } finally {
      this._commandLock = false;
    }
  }

  emitCommandResult(result) {
    if (this.socket && typeof this.socket.emit === 'function') {
      this.socket.emit('kiosk:command_result', result);
    }
  }

  async processPrintPhotoCommand({ commandId, payload = {} }) {
    const jobId = typeof payload.job_id === 'string' ? payload.job_id.trim() : '';
    const base = {
      command: 'PRINT_PHOTO',
      job_id: jobId || null,
      ...(commandId ? { commandId } : {}),
    };

    if (!jobId) {
      this.emitCommandResult({
        ...base,
        success: false,
        status: 'failed',
        printer_name: this.printerConfig.printerName,
        error_code: 'INVALID_JOB_ID',
        error_message: 'job_id wajib diisi',
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const existing = this.printJobs.get(jobId);
    if (existing) {
      this.emitCommandResult({
        ...base,
        success: existing.finalResult ? existing.finalResult.success : false,
        status: 'duplicate',
        duplicate: true,
        original_status: existing.status,
        printer_name: this.printerConfig.printerName,
        copies: existing.copies,
        original_result: existing.finalResult || undefined,
      });
      logger.warn('print_job_duplicate', { jobId, status: existing.status });
      return;
    }

    const record = { jobId, status: 'queued', copies: payload.copies };
    this.printJobs.set(jobId, record);
    if (this.printJobs.size > 1000) {
      const oldest = this.printJobs.keys().next().value;
      const oldestRecord = this.printJobs.get(oldest);
      if (oldestRecord && oldestRecord.status !== 'printing') this.printJobs.delete(oldest);
    }

    if (this.activePrintJobId) {
      await this.finishPrintJob(record, {
        success: false,
        status: 'failed',
        printer_name: this.printerConfig.printerName,
        copies: payload.copies,
        error_code: 'PRINTER_BUSY',
        error_message: 'Printer sedang memproses job lain',
      });
      return;
    }

    this.activePrintJobId = jobId;
    this.activePrintPromise = this.executePrintJob(record, payload, commandId)
      .catch((error) => this.finishPrintJob(record, {
        success: false,
        status: 'failed',
        printer_name: this.printerConfig.printerName,
        copies: payload.copies,
        error_code: error.code || 'PRINT_FAILED',
        error_message: error.message,
      }))
      .finally(() => {
        this.activePrintJobId = null;
        this.activePrintPromise = null;
      });
    await this.activePrintPromise;
  }

  async executePrintJob(record, payload) {
    const config = this.printerConfig;
    const copies = Number(payload.copies);
    const paperSize = String(payload.paper_size || config.paperSize).toUpperCase();
    const orientation = String(payload.orientation || config.orientation).toLowerCase();

    if (!config.enabled || config.adapter === 'disabled' || !this.printerAdapter || !config.printerName) {
      const error = new Error('Printer belum dikonfigurasi');
      error.code = 'PRINTER_NOT_CONFIGURED';
      throw error;
    }
    if (!Number.isInteger(copies) || copies < 1 || copies > config.copiesLimit) {
      const error = new Error(`copies harus berada di antara 1 dan ${config.copiesLimit}`);
      error.code = 'INVALID_COPIES';
      throw error;
    }
    if (!isSupportedPaperSize(paperSize)) {
      const error = new Error(`paper_size tidak didukung: ${paperSize}`);
      error.code = 'INVALID_PAPER_SIZE';
      throw error;
    }
    if (!['portrait', 'landscape'].includes(orientation)) {
      const error = new Error(`orientation tidak didukung: ${orientation}`);
      error.code = 'INVALID_ORIENTATION';
      throw error;
    }

    record.copies = copies;
    const check = await this.withTimeout(() => this.printerAdapter.checkPrinter(), config.timeoutMs);
    if (!check || check.errorCode === 'PRINTER_NOT_CONFIGURED') {
      const error = new Error('Printer belum dikonfigurasi');
      error.code = 'PRINTER_NOT_CONFIGURED';
      throw error;
    }
    if (check.errorCode === 'PRINTER_NOT_FOUND' || check.exists === false) {
      const error = new Error('Printer tidak ditemukan');
      error.code = 'PRINTER_NOT_FOUND';
      throw error;
    }
    if (check.errorCode === 'PRINTER_OFFLINE' || check.online === false) {
      const error = new Error('Printer tidak tersedia');
      error.code = 'PRINTER_OFFLINE';
      throw error;
    }

    let download;
    try {
      download = await downloadImage(payload.image_url, {
        maxBytes: config.maxImageBytes,
        timeoutMs: config.timeoutMs,
        fetchImpl: this.fetchImpl,
      });

      record.status = 'printing';
      this.emitCommandResult({
        command: 'PRINT_PHOTO',
        job_id: record.jobId,
        success: false,
        status: 'printing',
        printer_name: config.printerName,
        copies,
      });
      logger.info('print_job_started', { jobId: record.jobId, printerName: config.printerName, copies, size: download.size });

      const printResult = await this.runPrintWithRetry(download.filePath, {
        copies,
        paperSize,
        orientation,
      });
      const paper = await this.readPaperStatus();
      await this.refreshPrinterTelemetry();
      await this.finishPrintJob(record, {
        success: true,
        status: 'success',
        printer_name: config.printerName,
        copies,
        paper_stock_left: paper.remaining,
        request_id: printResult && printResult.requestId,
      });
    } finally {
      await cleanupDownloadedImage(download);
    }
  }

  async runPrintWithRetry(filePath, options) {
    let attempt = 0;
    while (true) {
      try {
        return await this.withTimeout(() => this.printerAdapter.printImage(filePath, options), this.printerConfig.timeoutMs);
      } catch (error) {
        const transient = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'PRINTER_OFFLINE'].includes(error.code);
        if (!transient || attempt >= this.printerConfig.retryCount) throw error;
        attempt += 1;
        logger.warn('print_retry', { attempt, errorCode: error.code });
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * attempt, 3000)));
      }
    }
  }

  async finishPrintJob(record, result) {
    record.status = result.success ? 'success' : 'failed';
    record.finalResult = {
      command: 'PRINT_PHOTO',
      job_id: record.jobId,
      ...result,
      completed_at: new Date().toISOString(),
    };
    hardware.updatePrinterTelemetry({
      status: result.success ? 'READY' : this.printerStatusForError(result.error_code),
      lastPrintError: result.success ? null : result.error_message,
      printsRemaining: result.paper_stock_left,
    });
    this.emitCommandResult(record.finalResult);
    logger[result.success ? 'info' : 'error']('print_job_completed', {
      jobId: record.jobId,
      success: result.success,
      errorCode: result.error_code,
    });
  }

  async readPaperStatus() {
    try {
      return await this.withTimeout(() => this.printerAdapter.getPaperStatus(), this.printerConfig.timeoutMs);
    } catch (error) {
      logger.warn('printer_paper_status_unavailable', { errorCode: error.code || 'STATUS_FAILED' });
      return { status: 'UNKNOWN', remaining: null };
    }
  }

  printerStatusForError(errorCode) {
    if (errorCode === 'PRINTER_OFFLINE') return 'OFFLINE';
    if (errorCode === 'PRINTER_NOT_FOUND') return 'NOT_FOUND';
    if (errorCode === 'PRINTER_NOT_CONFIGURED') return 'NOT_CONFIGURED';
    return 'ERROR';
  }

  async refreshPrinterTelemetry() {
    if (!this.printerAdapter) return;
    try {
      const status = await this.withTimeout(() => this.printerAdapter.getStatus(), this.printerConfig.timeoutMs);
      const paper = await this.readPaperStatus();
      hardware.updatePrinterTelemetry({
        status: status && status.status,
        paperStatus: paper && paper.status,
        printsRemaining: paper && paper.remaining,
        lastPrintError: status && status.errorCode ? status.errorCode : undefined,
      });
    } catch (error) {
      hardware.updatePrinterTelemetry({ status: error.code || 'ERROR', lastPrintError: error.message });
    }
  }

  withTimeout(operation, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        const error = new Error('Printer operation timed out');
        error.code = 'PRINT_TIMEOUT';
        settled = true;
        reject(error);
      }, timeoutMs);
      Promise.resolve().then(operation).then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }).catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async shutdown() {
    this.stopHeartbeatLoop();
    if (this.activePrintPromise) {
      try { await this.activePrintPromise; } catch {}
    }
    if (this.printerAdapter && typeof this.printerAdapter.close === 'function') await this.printerAdapter.close();
    if (this.socket) this.socket.disconnect();
  }

  /**
   * Applies Desired Config to Hardware & Local App Bridge, then Reports State to Backend
   */
  async handleConfigUpdate(newConfigPartial = {}) {
    const printing = newConfigPartial.printing && typeof newConfigPartial.printing === 'object'
      ? newConfigPartial.printing
      : null;
    logger.info('kiosk_config_applying', {
      hasPrinting: Boolean(printing),
      configVersion: printing?.config_version || null,
    });

    if (newConfigPartial.brightness !== undefined) {
      this.reportedState.brightness = hardware.applyBrightness(newConfigPartial.brightness);
    }
    if (newConfigPartial.volume !== undefined) {
      this.reportedState.volume = hardware.applyVolume(newConfigPartial.volume);
    }
    if (newConfigPartial.maintenanceMode !== undefined) {
      this.reportedState.maintenanceMode = Boolean(newConfigPartial.maintenanceMode);
    }
    if (newConfigPartial.resolution !== undefined) {
      this.reportedState.resolution = newConfigPartial.resolution;
    }
    if (newConfigPartial.paperSize !== undefined) {
      this.reportedState.paperSize = newConfigPartial.paperSize;
    }
    if (newConfigPartial.allowedLayouts !== undefined) {
      this.reportedState.allowedLayouts = newConfigPartial.allowedLayouts;
    }
    if (printing && printing.allowed_layouts !== undefined) {
      this.reportedState.allowedLayouts = printing.allowed_layouts;
    }

    // Ukuran kertas dari Admin HARUS ikut dilaporkan ke photobooth.
    //
    // Sebelumnya baris ini tidak ada: applyPrintingConfig menyimpan paper_size ke
    // this.printerConfig (dipakai saat mencetak), tetapi reportedState.paperSize
    // tidak pernah diperbarui dari sana. Akibatnya photobooth selalu meminta
    // '4R' walau Admin sudah memilih ukuran lain — jadi ukuran kertas tidak
    // pernah benar-benar dinamis.
    if (printing && printing.paper_size) {
      this.reportedState.paperSize = printing.paper_size;
    }

    // Kalibrasi cetak + penyesuaian tampilan foto. Sama alasannya dengan
    // paperSize di atas: disimpan ke printerConfig saja tidak cukup — photobooth
    // membaca reportedState lewat local bridge, jadi di sinilah nilainya harus
    // ikut dilaporkan atau Admin akan terlihat tersimpan tanpa efek apa pun.
    if (printing) {
      const calib = {
        photoBrightness: Number(printing.photo_brightness ?? 100),
        photoContrast: Number(printing.photo_contrast ?? 100),
        photoSaturation: Number(printing.photo_saturation ?? 100),
        thermalDensity: Number(printing.thermal_density ?? 3),
        thermalOffsetYPx: Number(printing.thermal_offset_y_px ?? 0),
        thermalOffsetXPx: Number(printing.thermal_offset_x_px ?? 0),
        printMarginTopPx: Number(printing.print_margin_top_px ?? 0),
        printMarginRightPx: Number(printing.print_margin_right_px ?? 0),
        printMarginLeftPx: Number(printing.print_margin_left_px ?? 0),
        printMarginBottomPx: Number(printing.print_margin_bottom_px ?? 0),
        photoFitMode: String(printing.photo_fit_mode || 'fit').toLowerCase(),
      };
      Object.assign(this.reportedState, calib);
    }

    if (printing) {
      await this.applyPrintingConfig(printing);
    }

    this.reportedState.updatedAt = new Date().toISOString();

    // Trigger local bridge broadcast for Photobooth App (localhost:3000)
    if (typeof this.onConfigChange === 'function') {
      this.onConfigChange(this.reportedState);
    }

    // Report back to backend as reported state
    if (this.socket && this.isConnected) {
      if (printing) await this.reportPrintingState(printing.config_version);
      else this.socket.emit('kiosk:config_reported', this.reportedState);
      console.log('[WSClient] Reported updated state back to Backend:', this.reportedState);
    }
  }

  async applyPrintingConfig(config = {}) {
    const adapter = String(config.adapter || 'disabled').toLowerCase();
    const enabled = Boolean(config.enabled);
    let printerName = enabled ? (config.printer_name || null) : null;

    if (enabled && printerName === 'AUTO') {
      try {
        const printers = await discoverPrinters({ timeoutMs: 5000 });
        
        // Filter out known virtual printers
        const virtualKeywords = ['pdf', 'onenote', 'xps', 'mock', 'fax', 'webex'];
        const physicalPrinters = printers.filter(p => 
          !virtualKeywords.some(k => p.name.toLowerCase().includes(k)) && 
          p.port_name !== 'nul:' && 
          p.port_name !== 'PORTPROMPT:' &&
          p.status !== 'OFFLINE'
        );

        const firstPrinter = physicalPrinters[0] || printers.find(p => p.status !== 'OFFLINE') || printers[0];
        
        if (firstPrinter) {
          printerName = firstPrinter.name;
          console.log(`[WSClient] Auto-detected printer for AUTO config: ${printerName}`);
        } else {
          console.warn('[WSClient] AUTO printer selected but no printers detected on this system.');
        }
      } catch (err) {
        console.warn('[WSClient] Failed to auto-detect printer:', err.message);
      }
    }

    const nextConfig = {
      ...this.printerConfig,
      enabled,
      adapter: enabled ? adapter : 'disabled',
      printerName,
      paperSize: String(config.paper_size || this.printerConfig.paperSize || '4R').toUpperCase(),
      orientation: String(config.orientation || this.printerConfig.orientation || 'portrait').toLowerCase(),
      copiesLimit: Number(config.copies_limit || this.printerConfig.copiesLimit || 1),
      timeoutMs: Number(config.timeout_ms || this.printerConfig.timeoutMs || 60000),
      retryCount: Number(config.retry_count ?? this.printerConfig.retryCount ?? 2),
      // Kalibrasi cetak + penyesuaian tampilan foto dari Admin.
      //
      // Nilai ini WAJIB sampai ke photobooth: photobooth yang menggambar hasil
      // akhir dan memanggil printer, sedangkan agent hanya meneruskan. Kalau
      // hanya disimpan di sini tanpa ikut dilaporkan lewat reportedState,
      // Admin akan terlihat "tersimpan" tetapi cetakan tidak berubah.
      photoBrightness: Number(config.photo_brightness ?? this.printerConfig.photoBrightness ?? 100),
      photoContrast: Number(config.photo_contrast ?? this.printerConfig.photoContrast ?? 100),
      photoSaturation: Number(config.photo_saturation ?? this.printerConfig.photoSaturation ?? 100),
      thermalDensity: Number(config.thermal_density ?? this.printerConfig.thermalDensity ?? 3),
      thermalOffsetYPx: Number(config.thermal_offset_y_px ?? this.printerConfig.thermalOffsetYPx ?? 0),
      thermalOffsetXPx: Number(config.thermal_offset_x_px ?? this.printerConfig.thermalOffsetXPx ?? 0),
      printMarginTopPx: Number(config.print_margin_top_px ?? this.printerConfig.printMarginTopPx ?? 0),
      printMarginRightPx: Number(config.print_margin_right_px ?? this.printerConfig.printMarginRightPx ?? 0),
      printMarginLeftPx: Number(config.print_margin_left_px ?? this.printerConfig.printMarginLeftPx ?? 0),
      printMarginBottomPx: Number(config.print_margin_bottom_px ?? this.printerConfig.printMarginBottomPx ?? 0),
      photoFitMode: String(config.photo_fit_mode || this.printerConfig.photoFitMode || 'fit').toLowerCase(),
    };

    if (!SUPPORTED_ADAPTER_NAMES.includes(nextConfig.adapter)) throw new Error('Unsupported printer adapter received from backend');
    if (nextConfig.adapter !== 'disabled' && !supportedAdapters().includes(nextConfig.adapter)) throw new Error(`Printer adapter ${nextConfig.adapter} is not supported by this agent`);
    if (nextConfig.enabled && !nextConfig.printerName) throw new Error('Enabled printer configuration has no printer name');
    if (!isSupportedPaperSize(nextConfig.paperSize)) throw new Error('Unsupported paper size received from backend');
    if (!['portrait', 'landscape'].includes(nextConfig.orientation)) throw new Error('Unsupported printer orientation received from backend');
    if (!Number.isInteger(nextConfig.copiesLimit) || nextConfig.copiesLimit < 1 || nextConfig.copiesLimit > 10) throw new Error('Invalid printer copies limit received from backend');
    if (!Number.isInteger(nextConfig.timeoutMs) || nextConfig.timeoutMs < 5000 || nextConfig.timeoutMs > 300000) throw new Error('Invalid printer timeout received from backend');
    if (!Number.isInteger(nextConfig.retryCount) || nextConfig.retryCount < 0 || nextConfig.retryCount > 3) throw new Error('Invalid printer retry count received from backend');

    if (this.printerAdapter && typeof this.printerAdapter.close === 'function') await this.printerAdapter.close();
    this.printerConfig = nextConfig;
    this.printerAdapter = createPrinterAdapter(nextConfig);
    this.reportedState.paperSize = nextConfig.paperSize;
    this.reportedState.printing = {
      ...this.reportedState.printing,
      enabled: nextConfig.enabled,
      adapter: nextConfig.adapter,
      printer_name: nextConfig.printerName,
      config_version: Number(config.config_version || 0),
      last_print_error: null,
    };
  }

  async reportPrintingState(configVersion = this.reportedState.printing.config_version) {
    if (!this.printerAdapter) return;
    let status = { status: 'UNKNOWN' };
    let paper = { status: 'UNKNOWN', remaining: null };
    let printers = [];
    try {
      status = await this.withTimeout(() => this.printerAdapter.getStatus(), this.printerConfig.timeoutMs);
      paper = await this.withTimeout(() => this.printerAdapter.getPaperStatus(), this.printerConfig.timeoutMs);
      printers = await this.withTimeout(() => this.printerAdapter.listPrinters(), this.printerConfig.timeoutMs);
      if (this.printerConfig.adapter === 'disabled') {
        printers = await this.withTimeout(() => discoverPrinters({ timeoutMs: this.printerConfig.timeoutMs }), this.printerConfig.timeoutMs);
      }
      this.availablePrinters = printers;
    } catch (error) {
      status = { status: 'ERROR', errorCode: error.code || 'STATUS_FAILED' };
    }
    const printing = {
      ...this.reportedState.printing,
      enabled: this.printerConfig.enabled,
      adapter: this.printerConfig.adapter,
      printer_name: this.printerConfig.printerName,
      config_version: Number(configVersion || 0),
      status: status.status || 'UNKNOWN',
      paper_status: paper.status || 'UNKNOWN',
      prints_remaining: paper.remaining ?? null,
      last_print_error: this.printerConfig.adapter === 'disabled'
        ? null
        : (status.errorCode || hardware.lastPrinterError || null),
    };
    this.reportedState.printing = printing;
    hardware.updatePrinterTelemetry({
      status: printing.status,
      paperStatus: printing.paper_status,
      printsRemaining: printing.prints_remaining,
      lastPrintError: printing.last_print_error,
    });
    if (this.socket && this.isConnected) {
      this.socket.emit('kiosk:config_reported', {
        deviceId: this.deviceId,
        config_version: printing.config_version,
        printing,
        supported_adapters: supportedAdapters(),
        available_printers: printers,
        reported_at: new Date().toISOString(),
      });
    }
  }
}

module.exports = KioskWSClient;
