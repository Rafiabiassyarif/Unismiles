const pool = require('../config/db');

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function format(row) {
  if (!row) return null;
  const config = {
    enabled: Boolean(row.printing_enabled),
    adapter: row.adapter,
    printer_name: row.printer_name || null,
    paper_size: row.paper_size,
    orientation: row.orientation,
    copies_limit: Number(row.copies_limit),
    timeout_ms: Number(row.timeout_ms),
    config_version: Number(row.config_version),
    allowed_layouts: parseJson(row.allowed_layouts, []),
    // Kalibrasi cetak + penyesuaian tampilan foto. Kolom ini ditambahkan
    // migrate_print_calibration.sql; `?? default` menjaga baris lama tetap valid.
    photo_brightness: Number(row.photo_brightness ?? 100),
    photo_contrast: Number(row.photo_contrast ?? 100),
    photo_saturation: Number(row.photo_saturation ?? 100),
    thermal_density: Number(row.thermal_density ?? 3),
    thermal_offset_y_px: Number(row.thermal_offset_y_px ?? 0),
    thermal_offset_x_px: Number(row.thermal_offset_x_px ?? 0),
    print_margin_top_px: Number(row.print_margin_top_px ?? 0),
    print_margin_right_px: Number(row.print_margin_right_px ?? 0),
    print_margin_left_px: Number(row.print_margin_left_px ?? 0),
    print_margin_bottom_px: Number(row.print_margin_bottom_px ?? 0),
    print_sharpen: Number(row.print_sharpen ?? 0),
    photo_fit_mode: row.photo_fit_mode || 'fit',
    grayscale_algorithm: row.grayscale_algorithm || 'rec601',
    updated_by: row.updated_by || null,
    updated_at: row.updated_at,
    created_at: row.created_at,
  };
  const reported = row.reported_config_version === null || row.reported_config_version === undefined
    ? null
    : {
        config_version: Number(row.reported_config_version),
        adapter: row.reported_adapter || null,
        printer_name: row.reported_printer_name || null,
        status: row.reported_status || null,
        paper_status: row.reported_paper_status || null,
        prints_remaining: row.reported_prints_remaining === null || row.reported_prints_remaining === undefined ? null : Number(row.reported_prints_remaining),
        last_print_error: row.reported_last_print_error || null,
        supported_adapters: parseJson(row.supported_adapters, []),
        available_printers: parseJson(row.available_printers, []),
        reported_at: row.reported_at,
      };

  return {
    ...config,
    config,
    reported,
    status: {
      desired: 'stored',
      reported: reported ? 'reported' : 'not_reported',
      applied: Boolean(reported && reported.config_version === config.config_version),
      pending: !reported || reported.config_version !== config.config_version,
    },
  };
}

const model = {
  format,

  async findByKioskId(kioskId) {
    const [rows] = await pool.query(
      'SELECT * FROM kiosk_printing_configs WHERE kiosk_id = ? LIMIT 1',
      [kioskId]
    );
    return rows[0] || null;
  },

  async getOrCreate(kioskId, defaults = {}, updatedBy = null) {
    const existing = await this.findByKioskId(kioskId);
    if (existing) return existing;
    await pool.query(
      `INSERT INTO kiosk_printing_configs
       (kiosk_id, printing_enabled, adapter, printer_name, paper_size, orientation, copies_limit, timeout_ms, retry_count, allowed_layouts, config_version, updated_by,
        photo_brightness, photo_contrast, photo_saturation, thermal_density, thermal_offset_y_px, thermal_offset_x_px, print_margin_top_px, print_margin_right_px, print_margin_left_px, print_margin_bottom_px, photo_fit_mode, print_sharpen, grayscale_algorithm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [kioskId, defaults.printing_enabled !== undefined ? (defaults.printing_enabled ? 1 : 0) : 1, defaults.adapter || 'disabled', defaults.printer_name || 'AUTO',
        defaults.paper_size || '4R', defaults.orientation || 'portrait', defaults.copies_limit || 1,
        defaults.timeout_ms || 60000, defaults.retry_count ?? 2, JSON.stringify(defaults.allowed_layouts || []), updatedBy,
        defaults.photo_brightness ?? 100, defaults.photo_contrast ?? 100, defaults.photo_saturation ?? 100,
        defaults.thermal_density ?? 3, defaults.thermal_offset_y_px ?? 0, defaults.thermal_offset_x_px ?? 0,
        defaults.print_margin_top_px ?? 0, defaults.print_margin_right_px ?? 0,
        defaults.print_margin_left_px ?? 0, defaults.print_margin_bottom_px ?? 0, defaults.photo_fit_mode || 'fit',
        defaults.print_sharpen ?? 0, defaults.grayscale_algorithm || 'rec601']
    );
    return this.findByKioskId(kioskId);
  },

  async updateDesired(kioskId, config, updatedBy) {
    const current = await this.getOrCreate(kioskId);
    const unchanged = ['printing_enabled', 'adapter', 'printer_name', 'paper_size', 'orientation', 'copies_limit', 'timeout_ms', 'retry_count',
      'photo_brightness', 'photo_contrast', 'photo_saturation', 'thermal_density', 'thermal_offset_y_px', 'thermal_offset_x_px', 'print_margin_top_px', 'print_margin_right_px', 'print_margin_left_px', 'print_margin_bottom_px', 'photo_fit_mode', 'print_sharpen', 'grayscale_algorithm']
      .every(field => String(current[field] ?? '') === String(config[field] ?? '')) &&
      JSON.stringify(current.allowed_layouts || []) === JSON.stringify(config.allowed_layouts || []);
    if (unchanged) return current;
    const nextVersion = Number(current.config_version || 0) + 1;
    console.log('--- updateDesired ---', { config_allowed: config.allowed_layouts, current_allowed: current.allowed_layouts, unchanged });
    await pool.query(
      `UPDATE kiosk_printing_configs
       SET printing_enabled = ?, adapter = ?, printer_name = ?, paper_size = ?, orientation = ?,
           copies_limit = ?, timeout_ms = ?, retry_count = ?, allowed_layouts = ?, config_version = ?, updated_by = ?,
           photo_brightness = ?, photo_contrast = ?, photo_saturation = ?, thermal_density = ?, thermal_offset_y_px = ?, thermal_offset_x_px = ?, print_margin_top_px = ?, print_margin_right_px = ?, print_margin_left_px = ?, print_margin_bottom_px = ?, photo_fit_mode = ?, print_sharpen = ?, grayscale_algorithm = ?
       WHERE kiosk_id = ?`,
      [config.printing_enabled ? 1 : 0, config.adapter, config.printer_name, config.paper_size, config.orientation,
        config.copies_limit, config.timeout_ms, config.retry_count, JSON.stringify(config.allowed_layouts || []), nextVersion, updatedBy || null,
        config.photo_brightness ?? 100, config.photo_contrast ?? 100, config.photo_saturation ?? 100,
        config.thermal_density ?? 3, config.thermal_offset_y_px ?? 0, config.thermal_offset_x_px ?? 0,
        config.print_margin_top_px ?? 0, config.print_margin_right_px ?? 0,
        config.print_margin_left_px ?? 0, config.print_margin_bottom_px ?? 0, config.photo_fit_mode || 'fit',
        config.print_sharpen ?? 0, config.grayscale_algorithm || 'rec601', kioskId]
    );
    return this.findByKioskId(kioskId);
  },

  async updateReported(kioskId, report) {
    await this.getOrCreate(kioskId);
    await pool.query(
      `UPDATE kiosk_printing_configs
       SET reported_config_version = ?, reported_adapter = ?, reported_printer_name = ?, reported_status = ?,
           reported_paper_status = ?, reported_prints_remaining = ?, reported_last_print_error = ?,
           supported_adapters = ?, available_printers = ?, reported_at = ?
       WHERE kiosk_id = ?`,
      [report.config_version, report.adapter || null, report.printer_name || null, report.status || null,
        report.paper_status || null, report.prints_remaining ?? null, report.last_print_error || null,
        JSON.stringify(report.supported_adapters || []), JSON.stringify(report.available_printers || []),
        report.reported_at ? new Date(report.reported_at) : new Date(), kioskId]
    );
    return this.findByKioskId(kioskId);
  },
};

module.exports = model;
