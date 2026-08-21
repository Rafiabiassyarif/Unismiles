const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');

/**
 * Local IPC Bridge Server
 * Runs on http://localhost:3001 (and ws://localhost:3001)
 * Connects Kiosk Agent background service with the Photobooth Web App (localhost:3000).
 */
class LocalBridgeServer {
  constructor(port = 3001) {
    this.port = port;
    this.allowedOrigins = (process.env.LOCAL_BRIDGE_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
      .split(',').map(origin => origin.trim()).filter(Boolean);
    this.bridgeToken = process.env.LOCAL_BRIDGE_TOKEN || '';
    this.requireBridgeAuth = process.env.REQUIRE_LOCAL_BRIDGE_AUTH === 'true';
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    
    this.currentState = {
      maintenanceMode: false,
      brightness: 80,
      volume: 100,
      resolution: '1080x1920',
      paperSize: '4R',
      allowedLayouts: [],
      updatedAt: new Date().toISOString(),
    };

    this.initRoutes();
    this.initWebSocket();
  }

  initRoutes() {
    this.app.use(cors({
      origin: (origin, callback) => {
        if (!origin || this.allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin is not allowed by local bridge CORS'));
      },
    }));
    this.app.use(express.json({ limit: '128kb' }));

    const requireBridgeToken = (req, res, next) => {
      if (!this.requireBridgeAuth || (this.bridgeToken && req.get('x-local-bridge-token') === this.bridgeToken)) return next();
      return res.status(401).json({ success: false, message: 'Local bridge authentication required.' });
    };

    // GET /api/kiosk-status
    this.app.get('/api/kiosk-status', (req, res) => {
      res.json({
        success: true,
        data: this.currentState,
        timestamp: new Date().toISOString(),
      });
    });

    // POST /api/print-job (local print command trigger from photobooth app)
    this.app.post('/api/print-job', requireBridgeToken, (req, res) => {
      const { copies = 1, sessionCode } = req.body;
      if (!sessionCode || !/^[A-Za-z0-9_-]{1,128}$/.test(String(sessionCode))) {
        return res.status(400).json({ success: false, message: 'A valid sessionCode is required.' });
      }
      if (!Number.isInteger(Number(copies)) || Number(copies) < 1 || Number(copies) > 10) {
        return res.status(400).json({ success: false, message: 'copies must be between 1 and 10.' });
      }
      console.log(`[LocalBridge] Print job received for session: ${sessionCode}, copies: ${copies}`);
      return res.status(501).json({ success: false, message: 'Local print bridge is not an execution endpoint. Use the authenticated backend print-job API.' });
    });

    // POST /api/update-credentials (sync photobooth UI credentials to agent-config.json)
    this.app.post('/api/update-credentials', async (req, res) => {
      const { backendUrl, deviceId, deviceToken } = req.body;
      try {
        const configManager = require('./configManager');
        const newConfig = {};
        if (backendUrl) newConfig.backendUrl = backendUrl;
        if (deviceId) newConfig.deviceId = deviceId;
        if (deviceToken) newConfig.deviceToken = deviceToken;

        const updatedConfig = configManager.saveConfig(newConfig);
        
        console.log('[LocalBridge] Credentials updated dynamically in agent-config.json.');
        
        // Notify the agent to reconnect without restarting the process
        if (typeof this.onCredentialsUpdated === 'function') {
          await this.onCredentialsUpdated(updatedConfig);
        }
        
        res.json({ success: true, message: 'Credentials updated. Agent is reconnecting.' });
      } catch (err) {
        console.error('[LocalBridge] Error updating credentials:', err);
        res.status(500).json({ success: false, message: 'Failed to update local configuration' });
      }
    });
  }

  initWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('[LocalBridge] Photobooth Web App connected to Local Bridge');

      // Send immediate initial state
      ws.send(JSON.stringify({
        type: 'INITIAL_STATE',
        payload: this.currentState,
      }));

      ws.on('message', (message) => {
        if (message.length > 128 * 1024) return ws.close(1009, 'Message too large');
        try {
          const data = JSON.parse(message);
          if (!data || typeof data !== 'object' || Array.isArray(data)) return;
          console.log('[LocalBridge] Photobooth state message received:', Object.keys(data).slice(0, 20));
        } catch (e) {
          // ignore non-json messages
        }
      });
    });
  }

  /**
   * Broadcasts maintenance mode and config changes to all connected local Photobooth apps.
   */
  broadcastState(newState) {
    this.currentState = { ...this.currentState, ...newState, updatedAt: new Date().toISOString() };
    const payloadStr = JSON.stringify({
      type: 'STATE_UPDATE',
      payload: this.currentState,
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payloadStr);
      }
    });

    console.log(`[LocalBridge] Broadcasted maintenanceMode=${this.currentState.maintenanceMode} to local Photobooth app.`);
  }

  start() {
    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[LocalBridge] Local IPC Bridge listening on http://localhost:${this.port}`);
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.wss.clients.forEach((client) => client.close());
      this.wss.close(() => {
        this.server.close(() => resolve());
      });
    });
  }
}

module.exports = LocalBridgeServer;
