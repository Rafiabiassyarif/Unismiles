const pool = require('../config/db');

/**
 * Derives kiosk status from last_heartbeat timestamp.
 * - online : heartbeat received within the last 2 minutes
 * - idle   : heartbeat received 2-10 minutes ago
 * - offline: heartbeat > 10 minutes ago OR never received
 *
 * @param {Date|string|null} lastHeartbeat
 * @returns {'online'|'idle'|'offline'}
 */
function computeStatusFromHeartbeat(lastHeartbeat) {
  if (!lastHeartbeat) return 'offline';
  const diffMs = Date.now() - new Date(lastHeartbeat).getTime();
  const diffMin = diffMs / 60000;
  if (diffMin < 2) return 'online';
  return 'offline';
}

/**
 * Formats database kiosk record into clean, consistent object for Admin App & Socket API.
 */
function formatKioskResponse(kiosk) {
  if (!kiosk) return null;

  const health = typeof kiosk.health === 'string'
    ? JSON.parse(kiosk.health || '{}')
    : (kiosk.health || {});

  const config = typeof kiosk.config === 'string'
    ? JSON.parse(kiosk.config || '{}')
    : (kiosk.config || {});

  const calculatedStatus = computeStatusFromHeartbeat(kiosk.last_heartbeat);

  return {
    id: kiosk.id,
    deviceId: kiosk.id,
    name: kiosk.name,
    location: kiosk.location || '',
    price: Number(kiosk.base_price || 0),
    base_price: Number(kiosk.base_price || 0),
    orientation: kiosk.orientation || 'PORTRAIT 1080x1920',
    status: calculatedStatus,
    lastSeenAt: kiosk.last_heartbeat ? new Date(kiosk.last_heartbeat).toISOString() : null,
    last_heartbeat: kiosk.last_heartbeat,
    inkLevel: health.printerInk ?? health.inkLevel ?? 100,
    storageUsedPercent: health.storageUsedPercent ?? health.storage ?? 0,
    cameraStatus: health.cameraStatus ?? health.camera ?? 'GOOD',
    paperStatus: health.paperStatus || 'NORMAL',
    printsRemaining: health.printsRemaining ?? 100,
    user_id: kiosk.user_id,
    config: {
      brightness: config.brightness ?? 80,
      volume: config.volume ?? 100,
      maintenanceMode: Boolean(config.maintenanceMode ?? config.maintenance_mode ?? false),
      isActive: config.isActive !== undefined ? Boolean(config.isActive) : true,
      resolution: config.resolution || '1080x1920',
      paperSize: config.paperSize || '4x6',
      paperStatus: config.paperStatus || 'NORMAL',
      printsRemaining: config.printsRemaining ?? 100,
      ...config,
    },
    created_at: kiosk.created_at,
    updated_at: kiosk.updated_at,
    api_key: kiosk.api_key,
  };
}

const Kiosk = {
  computeStatusFromHeartbeat,
  formatKioskResponse,

  async findByApiKey(apiKey) {
    const [rows] = await pool.query(
      'SELECT * FROM kiosks WHERE api_key = ? AND deleted_at IS NULL LIMIT 1',
      [apiKey]
    );
    return rows[0] || null;
  },

  async findByUserId(userId) {
    const [rows] = await pool.query(
      'SELECT * FROM kiosks WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  },

  async getAllKiosksFormatted(userId = null, userRole = 'Super Admin') {
    let query = 'SELECT * FROM kiosks WHERE deleted_at IS NULL';
    const params = [];

    if (userId && userRole !== 'Super Admin') {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.query(query, params);
    return rows.map(row => formatKioskResponse(row));
  },

  async getKioskById(id) {
    const [rows] = await pool.query(
      'SELECT * FROM kiosks WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    return rows[0] || null;
  },

  async getKioskByIdFormatted(id) {
    const raw = await this.getKioskById(id);
    return formatKioskResponse(raw);
  },

  async create(kioskData) {
    const { id, name, location, base_price, price, user_id, api_key, status, orientation, config } = kioskData;
    const finalPrice = price !== undefined ? price : (base_price !== undefined ? base_price : 0);
    const defaultConfig = {
      brightness: 80,
      volume: 100,
      maintenanceMode: false,
      isActive: true,
      resolution: '1080x1920',
      paperSize: '4x6',
      paperStatus: 'NORMAL',
      printsRemaining: 100,
      ...config,
    };

    const [result] = await pool.query(
      `INSERT INTO kiosks (id, user_id, name, location, base_price, api_key, orientation, status, config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        user_id || null,
        name,
        location || '',
        finalPrice,
        api_key,
        orientation || 'PORTRAIT 1080x1920',
        status || 'offline',
        JSON.stringify(defaultConfig),
      ]
    );
    return result;
  },

  async updateKiosk(id, { name, location, base_price, price, orientation, config }) {
    const fields = [];
    const params = [];

    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (location !== undefined) { fields.push('location = ?'); params.push(location); }
    if (price !== undefined || base_price !== undefined) {
      fields.push('base_price = ?');
      params.push(price !== undefined ? price : base_price);
    }
    if (orientation !== undefined) { fields.push('orientation = ?'); params.push(orientation); }
    if (config !== undefined) {
      fields.push('config = ?');
      params.push(typeof config === 'string' ? config : JSON.stringify(config));
    }

    if (fields.length === 0) return { affectedRows: 0 };

    params.push(id);
    const [result] = await pool.query(
      `UPDATE kiosks SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
    return result;
  },

  async updateConfig(id, newConfigPartial) {
    const existing = await this.getKioskById(id);
    if (!existing) return null;

    const currentConfig = typeof existing.config === 'string'
      ? JSON.parse(existing.config || '{}')
      : (existing.config || {});

    const mergedConfig = { ...currentConfig, ...newConfigPartial };

    const [result] = await pool.query(
      'UPDATE kiosks SET config = ? WHERE id = ?',
      [JSON.stringify(mergedConfig), id]
    );

    return result;
  },

  async regenerateApiKey(id, newApiKey) {
    const [result] = await pool.query(
      'UPDATE kiosks SET api_key = ? WHERE id = ?',
      [newApiKey, id]
    );
    return result;
  },

  async updateHeartbeatAndStatus(id, healthData) {
    const status = computeStatusFromHeartbeat(new Date());
    const [result] = await pool.query(
      'UPDATE kiosks SET last_heartbeat = CURRENT_TIMESTAMP, health = ?, status = ? WHERE id = ?',
      [JSON.stringify(healthData), status, id]
    );
    return result;
  },

  async updatePrintsRemaining(id, copies, paperStockLeft) {
    const kiosk = await this.getKioskById(id);
    if (!kiosk) return null;

    const health = typeof kiosk.health === 'string'
      ? JSON.parse(kiosk.health || '{}')
      : (kiosk.health || {});
    const current = Number(health.printsRemaining);
    const remaining = Number.isFinite(Number(paperStockLeft))
      ? Math.max(0, Number(paperStockLeft))
      : (Number.isFinite(current) ? Math.max(0, current - Number(copies || 0)) : null);

    if (remaining === null) return null;

    health.printsRemaining = remaining;
    const [result] = await pool.query(
      'UPDATE kiosks SET health = ? WHERE id = ?',
      [JSON.stringify(health), id]
    );

    return result;
  },

  /** @deprecated Use updateHeartbeatAndStatus instead */
  async updateHeartbeat(id, healthData) {
    return this.updateHeartbeatAndStatus(id, healthData);
  },

  async softDelete(id) {
    const [result] = await pool.query(
      'UPDATE kiosks SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
    return result;
  },
};

module.exports = Kiosk;
