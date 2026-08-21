require('dotenv').config();

const LocalBridgeServer = require('./localBridge');
const KioskWSClient = require('./wsClient');
const { DisabledPrinterAdapter } = require('./printerAdapter');
const { createPrinterAdapter } = require('./printerAdapterFactory');
const logger = require('./logger');

/**
 * Uni-Smiles Kiosk Agent Service
 * Standalone background process running on the Kiosk computer.
 */
function main() {
  console.log('====================================================');
  console.log('       Uni-Smiles Kiosk Agent Service v1.0.0       ');
  console.log('====================================================');

  const configManager = require('./configManager');
  
  let backendUrl = configManager.backendUrl;
  backendUrl = backendUrl.replace('localhost', '127.0.0.1');
  const deviceId = configManager.deviceId || 'KIOSK-001';
  const deviceToken = configManager.deviceToken;
  
  if (process.env.NODE_ENV === 'production' && (!backendUrl || /^http:\/\/localhost(?::\d+)?$/i.test(backendUrl))) {
    throw new Error('BACKEND_URL must point to the deployed backend in production.');
  }
  if (!deviceToken) {
    console.warn('[Agent Config] No deviceToken found. Starting in disconnected mode. Please configure via Photobooth UI.');
  }
  const localBridgePort = parseInt(process.env.LOCAL_BRIDGE_PORT || '3001', 10);
  const heartbeatIntervalMs = parseInt(process.env.HEARTBEAT_INTERVAL || '20000', 10);
  const printMode = (process.env.PRINT_MODE || (process.platform === 'darwin' ? 'macos' : 'disabled')).toLowerCase();
  const printerName = (process.env.PRINTER_NAME || '').trim() || null;
  const printerConfig = {
    printerName,
    paperSize: process.env.PAPER_SIZE || '4R',
    orientation: process.env.PRINT_ORIENTATION || 'portrait',
    copiesLimit: parseInt(process.env.PRINT_COPIES_LIMIT || '1', 10),
    timeoutMs: parseInt(process.env.PRINT_TIMEOUT_MS || '60000', 10),
    maxImageBytes: parseInt(process.env.PRINT_MAX_IMAGE_BYTES || String(15 * 1024 * 1024), 10),
    retryCount: parseInt(process.env.PRINT_RETRY_COUNT || '2', 10),
  };

  const initialAdapter = printMode === 'macos' || printMode === 'lp' ? 'cups' : printMode;
  let printerAdapter;
  let activeAdapter = initialAdapter;
  try {
    printerAdapter = createPrinterAdapter({ ...printerConfig, adapter: initialAdapter });
  } catch (error) {
    console.warn(`[Agent Config] ${error.message}; printing starts disabled.`);
    printerAdapter = new DisabledPrinterAdapter(`Unsupported PRINT_MODE=${printMode}`);
    activeAdapter = 'disabled';
  }

  console.log(`[Agent Config] Device ID: ${deviceId}`);
  console.log(`[Agent Config] Backend URL: ${backendUrl}`);
  console.log(`[Agent Config] Local Bridge Port: ${localBridgePort}`);
  console.log(`[Agent Config] Heartbeat Interval: ${heartbeatIntervalMs} ms (${heartbeatIntervalMs / 1000}s)`);
  logger.info('agent_print_configured', {
    printMode,
    printerName: printerName || null,
    paperSize: printerConfig.paperSize,
    orientation: printerConfig.orientation,
    copiesLimit: printerConfig.copiesLimit,
    timeoutMs: printerConfig.timeoutMs,
  });

  // 1. Initialize Local IPC Bridge Server (http://localhost:3001)
  const localBridge = new LocalBridgeServer(localBridgePort);
  localBridge.start();

  // 2. Initialize Persistent WebSocket Client to Backend Server
  const wsClient = new KioskWSClient({
    backendUrl,
    deviceId,
    deviceToken,
    heartbeatIntervalMs,
    printerAdapter,
    printerConfig: { ...printerConfig, enabled: activeAdapter !== 'disabled', adapter: activeAdapter },
    onConfigChange: (updatedState) => {
      // Broadcast configuration and maintenance mode changes to Photobooth App (localhost:3000)
      localBridge.broadcastState(updatedState);
    },
  });

  // Start persistent connection loop with auto-reconnect
  if (deviceToken) {
    wsClient.connect();
  }

  // Hot-reload credentials without restart
  localBridge.onCredentialsUpdated = async (newConfig) => {
    let reloadedBackendUrl = newConfig.backendUrl;
    if (reloadedBackendUrl) {
      reloadedBackendUrl = reloadedBackendUrl.replace('localhost', '127.0.0.1');
    }
    
    await wsClient.reconnect({
      backendUrl: reloadedBackendUrl,
      deviceId: newConfig.deviceId,
      deviceToken: newConfig.deviceToken
    });
  };

  // ── Global Crash Safety Net ──
  // Prevents silent agent death when hardware drivers throw unexpected errors.
  // The agent stays alive and continues operating even after non-fatal exceptions.
  process.on('uncaughtException', (err) => {
    console.error('[FATAL] ❌ Uncaught Exception — agent will attempt to continue:', err);
    // Log to file for post-mortem analysis (PM2 also captures this)
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] ❌ Unhandled Promise Rejection:', reason);
  });

  // ── Graceful Shutdown ──
  const shutdown = async (signal) => {
    console.log(`\n[Agent] ${signal} received; shutting down Kiosk Agent gracefully...`);
    await wsClient.shutdown();
    await localBridge.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((error) => {
      logger.error('agent_shutdown_failed', { error: error.message });
      process.exit(1);
    });
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((error) => {
      logger.error('agent_shutdown_failed', { error: error.message });
      process.exit(1);
    });
  });
}

main();
