const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const kioskModel = require('../models/kioskModel');
const userModel = require('../models/userModel');
const kioskPrintingConfigModel = require('../models/kioskPrintingConfigModel');
const { toSocketPrintingConfig } = require('./printingConfigValidation');
const { handlePrintCommandResult } = require('../services/printJobService');
const { corsOrigin } = require('./security');

let io = null;
let kioskNamespace = null;
let adminNamespace = null;

/**
 * Maps kiosk ID to active socket IDs for fast direct messaging.
 * @type {Map<string, Set<string>>}
 */
const connectedKiosks = new Map();

function initSocketServer(server) {
  io = new Server(server, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
  });

  kioskNamespace = io.of('/kiosk');
  adminNamespace = io.of('/admin');

  // =========================================================================
  // Kiosk Agent Namespace (/kiosk)
  // =========================================================================
  kioskNamespace.use(async (socket, next) => {
    try {
      const apiKey = socket.handshake.auth?.token ||
                     socket.handshake.auth?.apiKey ||
                     socket.handshake.auth?.api_key ||
                     socket.handshake.query?.token ||
                     socket.handshake.query?.apiKey ||
                     socket.handshake.query?.api_key;

      if (!apiKey) {
        return next(new Error('Authentication error: Device token / api_key required'));
      }

      const kiosk = await kioskModel.findByApiKey(apiKey);
      if (!kiosk) {
        return next(new Error('Authentication error: Invalid device token'));
      }

      socket.kiosk = kiosk;
      next();
    } catch (err) {
      next(new Error(`Authentication error: ${err.message}`));
    }
  });

  kioskNamespace.on('connection', async (socket) => {
    const kioskId = socket.kiosk.id;
    console.log(`[Socket.IO /kiosk] Kiosk connected: ${socket.kiosk.name} (${kioskId})`);

    // Track active connection
    if (!connectedKiosks.has(kioskId)) {
      connectedKiosks.set(kioskId, new Set());
    }
    connectedKiosks.get(kioskId).add(socket.id);

    socket.join(`kiosk:${kioskId}`);

    // Update DB status to online and trigger heartbeat timestamp update
    const health = typeof socket.kiosk.health === 'string'
      ? JSON.parse(socket.kiosk.health || '{}')
      : (socket.kiosk.health || {});

    await kioskModel.updateHeartbeatAndStatus(kioskId, health);
    const updatedKiosk = await kioskModel.getKioskById(kioskId);

    // Broadcast online status to Admin dashboard
    broadcastToAdmin('kiosk:online', {
      kioskId,
      status: 'online',
      lastSeenAt: updatedKiosk?.last_heartbeat || new Date().toISOString(),
      kiosk: kioskModel.formatKioskResponse(updatedKiosk),
    });

    // Send initial handshake ack with both legacy desired config and the
    // versioned printer desired config. Printer state is kept separately so a
    // reported agent state can never overwrite the desired state.
    const printingConfig = await kioskPrintingConfigModel.getOrCreate(kioskId);
    const legacyConfig = typeof updatedKiosk?.config === 'string'
      ? JSON.parse(updatedKiosk.config)
      : (updatedKiosk?.config || {});
    socket.emit('kiosk:handshake_ack', {
      success: true,
      deviceId: kioskId,
      config: { ...legacyConfig, printing: toSocketPrintingConfig(printingConfig) },
      serverTime: new Date().toISOString(),
    });

    // -----------------------------------------------------------------------
    // Heartbeat listener (Agent pings every 20s)
    // -----------------------------------------------------------------------
    socket.on('heartbeat', async (data = {}) => {
      await handleHeartbeat(socket, data);
    });

    socket.on('kiosk:heartbeat', async (data = {}) => {
      await handleHeartbeat(socket, data);
    });

    // -----------------------------------------------------------------------
    // Reported state listener (Agent reports applied configuration)
    // -----------------------------------------------------------------------
    socket.on('kiosk:config_reported', async (reportedConfig = {}) => {
      try {
        if (reportedConfig.printing && typeof reportedConfig.printing === 'object') {
          const printing = reportedConfig.printing;
          const report = {
            config_version: Number(reportedConfig.config_version ?? printing.config_version),
            adapter: printing.adapter,
            printer_name: printing.printer_name,
            status: printing.status,
            paper_status: printing.paper_status,
            prints_remaining: printing.prints_remaining,
            last_print_error: printing.last_print_error,
            supported_adapters: Array.isArray(reportedConfig.supported_adapters) ? reportedConfig.supported_adapters : [],
            available_printers: Array.isArray(reportedConfig.available_printers) ? reportedConfig.available_printers : [],
            reported_at: reportedConfig.reported_at,
          };
          if (Number.isInteger(report.config_version) && report.config_version > 0) {
            const saved = await kioskPrintingConfigModel.updateReported(kioskId, report);
            broadcastToAdmin('kiosk:updated', {
              kioskId,
              printingConfig: kioskPrintingConfigModel.format(saved),
            });
          }
        } else {
          // Preserve the existing legacy config report contract.
          await kioskModel.updateConfig(kioskId, reportedConfig);
        }
        const latest = await kioskModel.getKioskById(kioskId);

        broadcastToAdmin('kiosk:updated', {
          kioskId,
          kiosk: kioskModel.formatKioskResponse(latest),
        });
      } catch (err) {
        console.error(`[Socket.IO /kiosk] Error processing reported config for ${kioskId}:`, err);
      }
    });

    // -----------------------------------------------------------------------
    // Command Execution Result listener
    // -----------------------------------------------------------------------
    socket.on('kiosk:command_result', async (resultData = {}) => {
      console.log(`[Socket.IO /kiosk] Command result from ${kioskId}:`, resultData);

      if (resultData.command === 'PRINT_PHOTO') {
        try {
          const printResult = await handlePrintCommandResult({ kioskId, result: resultData });
          if (printResult.updated) {
            broadcastToAdmin('kiosk:print_job_updated', {
              kioskId,
              job: printResult.job,
            });
          }
        } catch (err) {
          console.error(`[Socket.IO /kiosk] Error processing print result for ${kioskId}:`, err);
        }
      }

      broadcastToAdmin('kiosk:command_ack', {
        kioskId,
        ...resultData,
        timestamp: new Date().toISOString(),
      });
    });

    // -----------------------------------------------------------------------
    // Disconnect Handler
    // -----------------------------------------------------------------------
    socket.on('disconnect', async (reason) => {
      console.log(`[Socket.IO /kiosk] Kiosk disconnected: ${kioskId} (Reason: ${reason})`);

      if (connectedKiosks.has(kioskId)) {
        connectedKiosks.get(kioskId).delete(socket.id);
        if (connectedKiosks.get(kioskId).size === 0) {
          connectedKiosks.delete(kioskId);

          // Update status in DB if no other connections remain
          const latest = await kioskModel.getKioskById(kioskId);
          const formatted = latest ? kioskModel.formatKioskResponse(latest) : null;
          if (formatted) formatted.status = 'offline';

          broadcastToAdmin('kiosk:offline', {
            kioskId,
            status: 'offline',
            lastSeenAt: latest?.last_heartbeat || null,
            kiosk: formatted,
          });
        }
      }
    });
  });

  // Helper for processing heartbeat payloads
  async function handleHeartbeat(socket, data) {
    const kioskId = socket.kiosk.id;
    try {
      const existingKiosk = await kioskModel.getKioskById(kioskId);
      const existingHealth = typeof existingKiosk?.health === 'string'
        ? JSON.parse(existingKiosk.health || '{}')
        : (existingKiosk?.health || {});

      const healthData = {
        printerInk:          data.inkLevel !== undefined ? Number(data.inkLevel) : (data.printerInk !== undefined ? Number(data.printerInk) : (existingHealth.printerInk ?? 100)),
        storageUsedPercent:  data.storageUsedPercent !== undefined ? Number(data.storageUsedPercent) : (data.storage !== undefined ? Number(data.storage) : (existingHealth.storageUsedPercent ?? 0)),
        cameraStatus:        data.cameraStatus || data.camera || existingHealth.cameraStatus || 'GOOD',
        paperStatus:         data.paperStatus || existingHealth.paperStatus || 'NORMAL',
        printsRemaining:     data.printsRemaining !== undefined ? Number(data.printsRemaining) : (existingHealth.printsRemaining ?? 100),
      };

      await kioskModel.updateHeartbeatAndStatus(kioskId, healthData);
      const updatedKiosk = await kioskModel.getKioskById(kioskId);
      const formatted = kioskModel.formatKioskResponse(updatedKiosk);

      // Acknowledge heartbeat to kiosk agent
      socket.emit('kiosk:heartbeat_ack', {
        success: true,
        receivedAt: new Date().toISOString(),
        desiredConfig: formatted.config,
      });

      // Broadcast update to Admin dashboard
      broadcastToAdmin('kiosk:updated', {
        kioskId,
        kiosk: formatted,
      });
    } catch (err) {
      console.error(`[Socket.IO /kiosk] Heartbeat error for ${kioskId}:`, err);
    }
  }

  // =========================================================================
  // Admin Namespace (/admin)
  // =========================================================================
  adminNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.auth?.accessToken;
      if (!token) return next(new Error('Authentication error: admin token required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await userModel.findById(decoded.id);
      if (!user || (user.status && String(user.status).toLowerCase() !== 'active')) {
        return next(new Error('Authentication error: inactive or unknown admin'));
      }
      socket.user = user;
      return next();
    } catch (_error) {
      return next(new Error('Authentication error: invalid admin token'));
    }
  });

  adminNamespace.on('connection', (socket) => {
    console.log(`[Socket.IO /admin] Admin client connected (${socket.id}, user ${socket.user.id})`);
    socket.join('admin_room');

    socket.on('admin:subscribe_kiosks', async () => {
      try {
        const kiosks = await kioskModel.getAllKiosksFormatted();
        socket.emit('admin:kiosk_list', kiosks);
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO /admin] Admin client disconnected (${socket.id})`);
    });
  });

  return io;
}

function broadcastToAdmin(event, data) {
  if (adminNamespace) {
    adminNamespace.to('admin_room').emit(event, data);
  }
}

const ALLOWED_ADMIN_COMMANDS = new Set([
  'CAMERA_SELF_TEST',
  'PRINTER_CLEAN',
  'REBOOT',
  'SHUTDOWN',
  'SYNC_CONFIG',
  'UPDATE_CONFIG',
  'REFRESH_PRINTER_STATUS',
  'PRINT_PHOTO',
]);

function sendKioskCommand(kioskId, command, payload = {}) {
  if (!kioskNamespace) return false;
  if (!ALLOWED_ADMIN_COMMANDS.has(command) || !payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const room = `kiosk:${kioskId}`;
  kioskNamespace.to(room).emit('kiosk:command', {
    command,
    payload,
    issuedAt: new Date().toISOString(),
  });
  return connectedKiosks.has(kioskId) && connectedKiosks.get(kioskId).size > 0;
}

function pushKioskConfig(kioskId, desiredConfig) {
  if (!kioskNamespace) return false;
  const room = `kiosk:${kioskId}`;
  kioskNamespace.to(room).emit('kiosk:config_update', {
    config: desiredConfig,
    updatedAt: new Date().toISOString(),
  });
  return connectedKiosks.has(kioskId) && connectedKiosks.get(kioskId).size > 0;
}

function pushPrintingConfig(kioskId, desiredPrintingConfig) {
  if (!kioskNamespace) return false;
  const room = `kiosk:${kioskId}`;
  kioskNamespace.to(room).emit('kiosk:config_update', {
    config: {
      printing: desiredPrintingConfig,
    },
    updatedAt: new Date().toISOString(),
  });
  return connectedKiosks.has(kioskId) && connectedKiosks.get(kioskId).size > 0;
}

function isKioskConnected(kioskId) {
  return connectedKiosks.has(kioskId) && connectedKiosks.get(kioskId).size > 0;
}

module.exports = {
  initSocketServer,
  getIO: () => io,
  broadcastToAdmin,
  sendKioskCommand,
  pushKioskConfig,
  pushPrintingConfig,
  isKioskConnected,
};
