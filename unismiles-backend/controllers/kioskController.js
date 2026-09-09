const kioskModel = require('../models/kioskModel');
const crypto = require('crypto');
const pool = require('../config/db');
const { parseJson, resolvePrice } = require('../utils/price');
const { pushKioskConfig, sendKioskCommand, broadcastToAdmin, isKioskConnected, pushPrintingConfig } = require('../utils/socketServer');
const kioskPrintingConfigModel = require('../models/kioskPrintingConfigModel');
const { publicBaseUrl } = require('../utils/security');

function canAccessKiosk(user, kiosk) {
  return user?.role === 'Super Admin' || user?.role === 'admin' || String(kiosk?.user_id) === String(user?.id);
}

function notFoundKiosk(res) {
  return res.status(404).json({ success: false, message: 'Kiosk not found.' });
}

/**
 * Kiosk Controller
 * Handles HTTP requests/responses for Kiosk endpoints.
 */
const kioskController = {
  /**
   * @desc    Get all kiosks with real-time health and status data
   * @route   GET /api/v1/admin/kiosks
   * @access  Private (Admin)
   */
  getAdminKiosks: async (req, res, next) => {
    try {
      const userId = req.user ? req.user.id : null;
      const userRole = req.user ? req.user.role : 'Super Admin';

      const kiosks = await kioskModel.getAllKiosksFormatted(userId, userRole);

      kiosks.forEach(kiosk => {
        if (!isKioskConnected(kiosk.id)) {
          kiosk.status = 'offline';
        }
      });

      return res.status(200).json({
        success: true,
        count: kiosks.length,
        data: kiosks,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Get single kiosk by ID formatted
   * @route   GET /api/v1/admin/kiosks/:id
   * @access  Private / Public
   */
  getKioskById: async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, message: 'Kiosk ID is required.' });
      }

      const rawKiosk = await kioskModel.getKioskById(id);
      const kiosk = kioskModel.formatKioskResponse(rawKiosk);
      if (!kiosk) {
        return res.status(404).json({ success: false, message: `Kiosk not found with ID: ${id}` });
      }
      if (!canAccessKiosk(req.user, rawKiosk)) return notFoundKiosk(res);

      return res.status(200).json({
        success: true,
        data: kiosk,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Create a new kiosk & generate device token
   * @route   POST /api/v1/admin/kiosks
   * @access  Private (Admin)
   */
  createKiosk: async (req, res, next) => {
    try {
      const { id, name, location, price, base_price, orientation, config } = req.body;
      const userId = req.user ? req.user.id : null;

      if (!name) {
        return res.status(400).json({ success: false, message: 'Kiosk name is required.' });
      }

      const deviceToken = 'kiosk_' + crypto.randomBytes(16).toString('hex');
      const finalId = id || 'KSK-' + Math.floor(1000 + Math.random() * 9000);
      const finalPrice = price !== undefined ? price : (base_price !== undefined ? base_price : 0);

      await kioskModel.create({
        id: finalId,
        name,
        location: location || '',
        base_price: finalPrice,
        price: finalPrice,
        user_id: userId,
        api_key: deviceToken,
        orientation: orientation || 'PORTRAIT 1080x1920',
        status: 'offline',
        config: config || {},
      });
      await kioskPrintingConfigModel.getOrCreate(finalId, {}, userId);

      const newKiosk = await kioskModel.getKioskByIdFormatted(finalId);

      // Notify Admin WebSocket dashboard
      broadcastToAdmin('kiosk:created', { kiosk: newKiosk });

      return res.status(201).json({
        success: true,
        message: 'Kiosk created successfully.',
        data: {
          ...newKiosk,
          deviceToken,
          api_key: deviceToken,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Get configuration desired state for a specific kiosk
   * @route   GET /api/v1/admin/kiosks/:id/config
   * @access  Private (Admin)
   */
  getKioskConfig: async (req, res, next) => {
    try {
      const { id } = req.params;
      const kiosk = await kioskModel.getKioskByIdFormatted(id);

      if (!kiosk) {
        return res.status(404).json({ success: false, message: `Kiosk not found with ID: ${id}` });
      }
      if (!canAccessKiosk(req.user, await kioskModel.getKioskById(id))) return notFoundKiosk(res);

      return res.status(200).json({
        success: true,
        kioskId: id,
        data: kiosk.config,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Update desired configuration state for a kiosk & notify Kiosk Agent
   * @route   PUT /api/v1/admin/kiosks/:id/config
   * @access  Private (Admin)
   */
  updateKioskConfig: async (req, res, next) => {
    try {
      const { id } = req.params;
      const newConfig = req.body;

      const existingKiosk = await kioskModel.getKioskById(id);
      if (!existingKiosk) {
        return res.status(404).json({ success: false, message: `Kiosk not found with ID: ${id}` });
      }
      if (!canAccessKiosk(req.user, existingKiosk)) return notFoundKiosk(res);

      await kioskModel.updateConfig(id, newConfig);

      const updatedKiosk = await kioskModel.getKioskByIdFormatted(id);

      // Push desired config update via WebSocket to connected Kiosk Agent
      const agentNotified = pushKioskConfig(id, updatedKiosk.config);

      // Broadcast update to Admin UI dashboard
      broadcastToAdmin('kiosk:updated', { kiosk: updatedKiosk });

      return res.status(200).json({
        success: true,
        message: 'Kiosk configuration updated successfully.',
        agentNotified,
        data: updatedKiosk.config,
        kiosk: updatedKiosk,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Update general kiosk details (name, location, price, orientation)
   * @route   PUT /api/v1/admin/kiosks/:id
   * @access  Private (Admin)
   */
  updateKiosk: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, location, price, base_price, orientation, config } = req.body;

      const existingKiosk = await kioskModel.getKioskById(id);
      if (!existingKiosk) {
        return res.status(404).json({ success: false, message: `Kiosk not found with ID: ${id}` });
      }
      if (!canAccessKiosk(req.user, existingKiosk)) return notFoundKiosk(res);

      await kioskModel.updateKiosk(id, { name, location, price, base_price, orientation, config });
      const updatedKiosk = await kioskModel.getKioskByIdFormatted(id);

      if (config) {
        pushKioskConfig(id, updatedKiosk.config);
      }

      broadcastToAdmin('kiosk:updated', { kiosk: updatedKiosk });

      return res.status(200).json({
        success: true,
        message: 'Kiosk updated successfully.',
        data: updatedKiosk,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Regenerate device key / token for a kiosk
   * @route   POST /api/v1/admin/kiosks/:id/regenerate-key
   * @access  Private (Admin)
   */
  regenerateKey: async (req, res, next) => {
    try {
      const { id } = req.params;
      const existingKiosk = await kioskModel.getKioskById(id);

      if (!existingKiosk) {
        return res.status(404).json({ success: false, message: `Kiosk not found with ID: ${id}` });
      }
      if (!canAccessKiosk(req.user, existingKiosk)) return notFoundKiosk(res);

      const newDeviceToken = 'kiosk_' + crypto.randomBytes(16).toString('hex');
      await kioskModel.regenerateApiKey(id, newDeviceToken);

      const updatedKiosk = await kioskModel.getKioskByIdFormatted(id);
      broadcastToAdmin('kiosk:updated', { kiosk: updatedKiosk });

      return res.status(200).json({
        success: true,
        message: 'Device token regenerated successfully.',
        data: {
          id,
          deviceToken: newDeviceToken,
          api_key: newDeviceToken,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Delete a kiosk by ID (Soft delete)
   * @route   DELETE /api/v1/admin/kiosks/:id
   * @access  Private (Admin)
   */
  deleteKiosk: async (req, res, next) => {
    try {
      const { id } = req.params;
      const existingKiosk = await kioskModel.getKioskById(id);
      if (!existingKiosk || !canAccessKiosk(req.user, existingKiosk)) return notFoundKiosk(res);
      const result = await kioskModel.softDelete(id);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: `Kiosk not found with ID: ${id}` });
      }

      broadcastToAdmin('kiosk:deleted', { kioskId: id });

      return res.status(200).json({
        success: true,
        message: `Kiosk with ID ${id} deleted successfully.`,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Send command to a specific kiosk agent (e.g., CAMERA_SELF_TEST, REBOOT)
   * @route   POST /api/v1/admin/kiosks/:id/commands
   * @access  Private (Admin)
   */
  sendCommand: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { command, payload } = req.body;

      if (!command) {
        return res.status(400).json({ success: false, message: 'Command is required.' });
      }

      const kiosk = await kioskModel.getKioskById(id);
      if (!kiosk) {
        return res.status(404).json({ success: false, message: `Kiosk not found with ID: ${id}` });
      }
      if (!canAccessKiosk(req.user, kiosk)) return notFoundKiosk(res);
      const supportedCommands = new Set([
        'CAMERA_SELF_TEST', 'PRINTER_CLEAN', 'REBOOT', 'SHUTDOWN',
        'SYNC_CONFIG', 'UPDATE_CONFIG', 'REFRESH_PRINTER_STATUS', 'PRINT_PHOTO'
      ]);
      if (typeof command !== 'string' || !supportedCommands.has(command)) {
        return res.status(400).json({ success: false, message: 'Unsupported kiosk command.' });
      }
      if (['REBOOT', 'SHUTDOWN'].includes(command) && !['Super Admin', 'admin'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, message: 'Only Super Admin may issue this command.' });
      }
      if (payload !== undefined && (!payload || typeof payload !== 'object' || Array.isArray(payload))) {
        return res.status(400).json({ success: false, message: 'Command payload must be an object.' });
      }
      if (JSON.stringify(payload || {}).length > 16_384) {
        return res.status(413).json({ success: false, message: 'Command payload is too large.' });
      }

      const dispatched = sendKioskCommand(id, command, payload || {});
      const online = isKioskConnected(id);

      return res.status(200).json({
        success: true,
        message: dispatched
          ? `Command ${command} sent to kiosk ${id}.`
          : `Command ${command} queued for kiosk ${id} (Kiosk currently ${online ? 'online' : 'offline'}).`,
        data: {
          kioskId: id,
          command,
          payload: payload || {},
          dispatched,
          isOnline: online,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Get frame templates for active kiosk photobooth app
   * @route   GET /api/v1/kiosk/templates
   * @access  Kiosk (API Key verified)
   */
  getKioskTemplates: async (req, res) => {
    try {
      const userId = req.kiosk.user_id;
      const [rows] = await pool.query(
        `SELECT id, name, price, image_url, slot_count, layout_config, layout_id, bg_color, accent_color,
                frame_type, gradient_stops, gradient_angle, gradient_style, text_elements
         FROM frame_templates
         WHERE (user_id = ? OR user_id IS NULL) AND is_active = 1 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [userId]
      );

      const LAYOUT_LABELS = {
        '1x1': 'Polaroid',
        '2x1': 'Duo Strip',
        '3x1': 'Trio Strip',
        '4x1': 'Film Strip',
        '2x2': 'Classic 2x2',
        '2x3': 'Collage 6',
      };

      const layoutMap = new Map();

      rows.forEach(r => {
        const layoutId = r.layout_id || '1x1';
        if (!layoutMap.has(layoutId)) {
          layoutMap.set(layoutId, {
            id: layoutId,
            label: LAYOUT_LABELS[layoutId] || r.name || 'Custom Layout',
            enabled: true,
            styles: [],
          });
        }

        const parseJSON = (val, fallback = []) => parseJson(val, fallback);
        const layoutConfig = parseJSON(r.layout_config, {});

        const rawUrl = r.image_url ? r.image_url.trim() : (layoutConfig.overlayUrl || layoutConfig.overlay_url || '');
        const imageUrl = rawUrl
          ? (rawUrl.startsWith('http') ? rawUrl : `${publicBaseUrl(req)}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`)
          : null;

        const frameType = r.frame_type || (imageUrl ? 'png' : 'color');
        const gradStopsRaw = parseJSON(r.gradient_stops, []);
        const textElemsRaw = parseJSON(r.text_elements, []);

        let backgroundConfig = { type: 'solid', color: r.bg_color || '#ffffff' };
        if (frameType === 'gradient' && gradStopsRaw.length > 0) {
          backgroundConfig = {
            type: 'gradient',
            gradientType: r.gradient_style || 'linear',
            gradientAngle: r.gradient_angle ?? 45,
            gradientStops: gradStopsRaw.map(s => ({
              color: s.color,
              offset: s.position !== undefined ? s.position : (s.offset ?? 0),
            })),
          };
        } else if (frameType === 'png' && imageUrl) {
          backgroundConfig = { type: 'image', color: r.bg_color || '#ffffff' };
        } else if (frameType === 'color') {
          backgroundConfig = { type: 'solid', color: r.bg_color || '#ffffff' };
        }

        const elements = textElemsRaw.map((t, idx) => ({
          id: t.id || `text-${idx}`,
          type: 'text',
          content: t.text || '',
          x: Number(t.x ?? 50),
          y: Number(t.y ?? 50),
          fontSize: Number(t.fontSize || 40),
          fontFamily: t.fontFamily || 'Inter, sans-serif',
          color: t.color || '#FFFFFF',
          fontWeight: t.fontWeight || 'bold',
          opacity: 1,
          rotation: 0,
        }));

        const assetElementsRaw = parseJSON(layoutConfig.assetElements || layoutConfig.asset_elements, []);
        const assetElements = assetElementsRaw.map((a, idx) => {
          const aUrl = a.url || a.imageUrl || a.image_url || '';
          const fullUrl = aUrl.startsWith('http') ? aUrl : `${publicBaseUrl(req)}${aUrl.startsWith('/') ? '' : '/'}${aUrl}`;
          return {
            id: a.id || `asset-${idx}`,
            type: 'sticker',
            content: fullUrl,
            x: Number(a.x ?? 50),
            y: Number(a.y ?? 50),
            width: Number(a.width ?? a.w ?? 20),
            height: Number(a.height ?? a.h ?? 0),
            opacity: Number(a.opacity ?? 1),
            rotation: Number(a.rotation ?? 0),
            anchor: a.anchor || 'top-left'
          };
        });

        const price = resolvePrice({
          templatePrice: r.price,
          layoutConfig,
          kioskBasePrice: req.kiosk.base_price,
        });

        layoutMap.get(layoutId).styles.push({
          id: String(r.id),
          name: r.name,
          overlayUrl: imageUrl,
          backgroundConfig,
          elements: [...elements, ...assetElements],
          _accentColor: r.accent_color || '#FFFFFF',
          _layoutConfig: layoutConfig,
          price,
          layout_price: Number(layoutConfig.layout_price) || price,
        });
      });

      return res.status(200).json({ success: true, data: Array.from(layoutMap.values()) });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * @desc    Receive heartbeat ping from a kiosk hardware device over REST (legacy / fallback)
   * @route   POST /api/v1/kiosk/heartbeat
   * @access  Kiosk (API key required)
   */
  heartbeat: async (req, res) => {
    try {
      const kiosk = req.kiosk; // set by verifyApiKey middleware
      const { printerInk, inkLevel, storage, storageUsedPercent, camera, cameraStatus } = req.body;

      const healthData = {
        printerInk: inkLevel !== undefined ? Number(inkLevel) : (printerInk !== undefined ? Number(printerInk) : (kiosk.health?.printerInk ?? 100)),
        storageUsedPercent: storageUsedPercent !== undefined ? Number(storageUsedPercent) : (storage !== undefined ? Number(storage) : (kiosk.health?.storageUsedPercent ?? 0)),
        cameraStatus: cameraStatus || camera || kiosk.health?.cameraStatus || 'GOOD',
      };

      await kioskModel.updateHeartbeatAndStatus(kiosk.id, healthData);
      const updated = await kioskModel.getKioskByIdFormatted(kiosk.id);

      broadcastToAdmin('kiosk:updated', { kiosk: updated });

      return res.status(200).json({
        success: true,
        message: 'Heartbeat received.',
        data: {
          kiosk_id: kiosk.id,
          status: 'online',
          server_time: new Date().toISOString(),
          kiosk: updated,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * @desc    Get printer configuration for a specific kiosk
   * @route   GET /api/v1/admin/kiosks/:kioskId/printing-config
   * @access  Private (Admin)
   */
  getPrintingConfig: async (req, res, next) => {
    try {
      const { kioskId } = req.params;
      const kiosk = await kioskModel.getKioskById(kioskId);
      if (!kiosk) return notFoundKiosk(res);
      if (!canAccessKiosk(req.user, kiosk)) return notFoundKiosk(res);

      const config = await kioskPrintingConfigModel.getOrCreate(kioskId);
      return res.status(200).json({
        success: true,
        data: kioskPrintingConfigModel.format(config),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Update printer configuration for a specific kiosk
   * @route   PUT /api/v1/admin/kiosks/:kioskId/printing-config
   * @access  Private (Admin)
   */
  updatePrintingConfig: async (req, res, next) => {
    try {
      const { kioskId } = req.params;
      const data = req.body;
      console.log('--- updatePrintingConfig called! ---', { kioskId, data });
      const kiosk = await kioskModel.getKioskById(kioskId);
      if (!kiosk) return notFoundKiosk(res);
      if (!canAccessKiosk(req.user, kiosk)) return notFoundKiosk(res);

      const updated = await kioskPrintingConfigModel.updateDesired(kioskId, {
        printing_enabled: Boolean(data.printing_enabled),
        adapter: data.adapter,
        printer_name: data.printer_name,
        paper_size: data.paper_size,
        orientation: data.orientation,
        copies_limit: Number(data.copies_limit),
        timeout_ms: Number(data.timeout_ms),
        retry_count: Number(data.retry_count),
        allowed_layouts: Array.isArray(data.allowed_layouts) ? data.allowed_layouts : [],
      }, req.user?.id);

      const formatted = kioskPrintingConfigModel.format(updated);
      pushPrintingConfig(kioskId, formatted.config);
      broadcastToAdmin('kiosk:updated', { kioskId, printingConfig: formatted });

      return res.status(200).json({
        success: true,
        message: 'Printer configuration updated',
        data: formatted,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Send a test print command
   * @route   POST /api/v1/admin/kiosks/:kioskId/printing-config/test
   * @access  Private (Admin)
   */
  testPrintingConfig: async (req, res, next) => {
    try {
      const { kioskId } = req.params;
      const kiosk = await kioskModel.getKioskById(kioskId);
      if (!kiosk) return notFoundKiosk(res);
      if (!canAccessKiosk(req.user, kiosk)) return notFoundKiosk(res);

      const dispatched = sendKioskCommand(kioskId, 'PRINT_PHOTO', {
        job_id: 'test_' + crypto.randomUUID(),
        copies: 1,
        image_url: '/assets/test-print.png',
      });

      return res.status(200).json({
        success: true,
        message: dispatched ? 'Test print command sent' : 'Test print command queued',
        dispatched,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @desc    Refresh printer status by asking agent to report config
   * @route   POST /api/v1/admin/kiosks/:kioskId/printing-config/refresh
   * @access  Private (Admin)
   */
  refreshPrintingConfig: async (req, res, next) => {
    try {
      const { kioskId } = req.params;
      const kiosk = await kioskModel.getKioskById(kioskId);
      if (!kiosk) return notFoundKiosk(res);
      if (!canAccessKiosk(req.user, kiosk)) return notFoundKiosk(res);

      const dispatched = sendKioskCommand(kioskId, 'REFRESH_PRINTER_STATUS', {});

      return res.status(200).json({
        success: true,
        message: dispatched ? 'Refresh command sent' : 'Refresh command queued',
        dispatched,
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = kioskController;
