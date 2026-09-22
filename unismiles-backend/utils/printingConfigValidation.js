const { PAPER_SIZES, isKnownPaperSize, validateCustomSize, isThermalSize } = require('./paperSizes');

/**
 * Adapter yang dikenal.
 *
 * `thermal` ditambahkan untuk printer label termal (mis. NIIMBOT B1 Pro). Di
 * sistem operasi, printer itu tetap terpasang sebagai printer biasa (CUPS di
 * macOS, spooler di Windows), jadi adapter thermal melakukan hal yang sama
 * seperti adapter OS — bedanya ukuran kertas dan orientasinya mengikuti batas
 * printer label, bukan ukuran foto.
 */
const ADAPTERS = ['disabled', 'cups', 'windows', 'mock', 'thermal'];
const ORIENTATIONS = ['portrait', 'landscape'];

/**
 * Penyesuaian tampilan foto hasil cetak + kalibrasi termal.
 *
 * Satu sumber kebenaran untuk batas nilai, dipakai backend DAN dicerminkan di
 * Admin. Sebelumnya nilai-nilai ini hanya hidup di halaman uji localhost
 * (kertas, kepekatan, geser vertikal) atau ter-hardcode di Photobooth
 * (brightness/contrast/saturasi).
 *
 * PENTING — batas berikut adalah pengaman, bukan hiasan:
 *  - brightness/contrast di luar 50-150 akan merusak foto (putih total atau
 *    hitam total), dan pada printer termal 1-bit hasilnya hilang sama sekali.
 *  - saturation 0 memang sah (hitam putih).
 *  - density di luar 1-5 tidak dikenal driver Niimbot.
 *  - offset di luar ±200 px hanya menggeser gambar keluar dari kertas.
 */
const PHOTO_ADJUST_LIMITS = {
  photo_brightness: { min: 50, max: 150, fallback: 100 },
  photo_contrast: { min: 50, max: 150, fallback: 100 },
  photo_saturation: { min: 0, max: 150, fallback: 100 },
  thermal_density: { min: 1, max: 5, fallback: 3 },
  thermal_offset_y_px: { min: -200, max: 200, fallback: 0 },
};
const PHOTO_FIT_MODES = ['fit', 'stretch'];

const FORBIDDEN_FIELDS = new Set(['command', 'shell_command', 'executable_path', 'script', 'driver_command']);
const ALLOWED_FIELDS = new Set([
  'printing_enabled', 'adapter', 'printer_name', 'paper_size', 'orientation',
  'copies_limit', 'timeout_ms', 'retry_count', 'allowed_layouts',
  ...Object.keys(PHOTO_ADJUST_LIMITS), 'photo_fit_mode',
]);

class PrintingConfigValidationError extends Error {
  constructor(message, code = 'INVALID_PRINTING_CONFIG') {
    super(message);
    this.name = 'PrintingConfigValidationError';
    this.statusCode = 400;
    this.code = code;
  }
}

function integerField(value, name, min, max) {
  const numeric = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw new PrintingConfigValidationError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return numeric;
}

function validatePrinterName(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 255 || !/^[\p{L}\p{N} ._()\-/#:+@]+$/u.test(value)) {
    throw new PrintingConfigValidationError('printer_name contains unsupported characters.');
  }
  return value.trim() || null;
}

function validatePrintingConfig(input = {}, existing = {}, reported = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PrintingConfigValidationError('Printing configuration must be an object.');
  }

  for (const key of Object.keys(input)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      throw new PrintingConfigValidationError(`${key} is not accepted.`, 'FORBIDDEN_FIELD');
    }
    if (!ALLOWED_FIELDS.has(key)) {
      throw new PrintingConfigValidationError(`Unknown printing configuration field: ${key}.`, 'UNKNOWN_FIELD');
    }
  }

  const merged = {
    printing_enabled: existing.printing_enabled ?? false,
    adapter: existing.adapter || 'disabled',
    printer_name: existing.printer_name ?? null,
    paper_size: existing.paper_size || 'Instax Mini (54 × 86 mm)',
    orientation: existing.orientation || 'portrait',
    copies_limit: Number(existing.copies_limit ?? 1),
    timeout_ms: Number(existing.timeout_ms ?? 60000),
    retry_count: Number(existing.retry_count ?? 2),
    allowed_layouts: existing.allowed_layouts || [],
    // Tambahan kalibrasi + penyesuaian tampilan. Nilai lama dipakai kalau kolom
    // belum ada, supaya konfigurasi yang sudah tersimpan tidak rusak.
    photo_brightness: Number(existing.photo_brightness ?? PHOTO_ADJUST_LIMITS.photo_brightness.fallback),
    photo_contrast: Number(existing.photo_contrast ?? PHOTO_ADJUST_LIMITS.photo_contrast.fallback),
    photo_saturation: Number(existing.photo_saturation ?? PHOTO_ADJUST_LIMITS.photo_saturation.fallback),
    thermal_density: Number(existing.thermal_density ?? PHOTO_ADJUST_LIMITS.thermal_density.fallback),
    thermal_offset_y_px: Number(existing.thermal_offset_y_px ?? PHOTO_ADJUST_LIMITS.thermal_offset_y_px.fallback),
    photo_fit_mode: existing.photo_fit_mode || 'fit',
    ...input,
  };

  const enabled = Boolean(merged.printing_enabled);
  const adapter = typeof merged.adapter === 'string' ? merged.adapter.toLowerCase() : '';
  if (!ADAPTERS.includes(adapter)) {
    throw new PrintingConfigValidationError(`adapter must be one of: ${ADAPTERS.join(', ')}.`);
  }
  // Ukuran kertas: preset foto, preset termal, atau ukuran kustom "CUSTOM LxT MM".
  // Ukuran kustom divalidasi terhadap batas fisik printer termal supaya tidak ada
  // ukuran yang diterima sistem tetapi pasti terpotong di printer.
  if (!isKnownPaperSize(merged.paper_size)) {
    const custom = validateCustomSize(merged.paper_size);
    if (!custom.ok) {
      throw new PrintingConfigValidationError(
        custom.message || `paper_size must be one of: ${PAPER_SIZES.join(', ')}, atau ukuran kustom.`
      );
    }
  }
  if (!ORIENTATIONS.includes(merged.orientation)) {
    throw new PrintingConfigValidationError('orientation must be portrait or landscape.');
  }

  const normalized = {
    printing_enabled: enabled,
    adapter,
    printer_name: validatePrinterName(merged.printer_name),
    paper_size: merged.paper_size,
    orientation: merged.orientation,
    copies_limit: integerField(merged.copies_limit, 'copies_limit', 1, 10),
    timeout_ms: integerField(merged.timeout_ms, 'timeout_ms', 5000, 300000),
    retry_count: integerField(merged.retry_count, 'retry_count', 0, 3),
    allowed_layouts: Array.isArray(merged.allowed_layouts) ? merged.allowed_layouts.map(String) : [],
  };

  // Penyesuaian tampilan + kalibrasi termal. Divalidasi dengan batas fisiknya
  // sendiri supaya tidak ada nilai yang tersimpan tetapi pasti merusak hasil
  // cetak (mis. brightness 400 membuat foto putih total).
  for (const [field, limit] of Object.entries(PHOTO_ADJUST_LIMITS)) {
    normalized[field] = integerField(merged[field], field, limit.min, limit.max);
  }
  const fitMode = String(merged.photo_fit_mode || 'fit').toLowerCase();
  if (!PHOTO_FIT_MODES.includes(fitMode)) {
    throw new PrintingConfigValidationError(`photo_fit_mode must be one of: ${PHOTO_FIT_MODES.join(', ')}.`);
  }
  normalized.photo_fit_mode = fitMode;

  if (!enabled) {
    normalized.adapter = 'disabled';
    normalized.printer_name = null;
  } else {
    if (normalized.adapter === 'disabled') {
      throw new PrintingConfigValidationError('Printing cannot be enabled with the disabled adapter.');
    }
    if (!normalized.printer_name) {
      throw new PrintingConfigValidationError('printer_name is required when printing is enabled.');
    }
    const supported = Array.isArray(reported?.supported_adapters) ? reported.supported_adapters : null;
    if (supported && !supported.includes(normalized.adapter)) {
      throw new PrintingConfigValidationError('The selected adapter is not supported by this Kiosk Agent.', 'UNSUPPORTED_ADAPTER');
    }
    const available = Array.isArray(reported?.available_printers) ? reported.available_printers : null;
    if (available && available.length > 0 && !available.some(printer => printer && printer.name === normalized.printer_name)) {
      throw new PrintingConfigValidationError('The selected printer was not reported by this Kiosk Agent.', 'PRINTER_NOT_AVAILABLE');
    }
  }

  return normalized;
}

function toSocketPrintingConfig(row) {
  return {
    enabled: Boolean(row.printing_enabled),
    adapter: row.adapter,
    printer_name: row.printer_name || null,
    paper_size: row.paper_size,
    orientation: row.orientation,
    copies_limit: Number(row.copies_limit),
    timeout_ms: Number(row.timeout_ms),
    retry_count: Number(row.retry_count),
    config_version: Number(row.config_version),
    allowed_layouts: (() => {
      try {
        return typeof row.allowed_layouts === 'string' ? JSON.parse(row.allowed_layouts) : (row.allowed_layouts || []);
      } catch (e) {
        return [];
      }
    })(),
    // Penyesuaian tampilan + kalibrasi ikut dikirim ke kiosk-agent, yang
    // meneruskannya ke photobooth lewat local bridge. Tanpa ini, nilai yang
    // disimpan Admin tidak akan pernah sampai ke tempat yang mencetak.
    photo_brightness: Number(row.photo_brightness ?? PHOTO_ADJUST_LIMITS.photo_brightness.fallback),
    photo_contrast: Number(row.photo_contrast ?? PHOTO_ADJUST_LIMITS.photo_contrast.fallback),
    photo_saturation: Number(row.photo_saturation ?? PHOTO_ADJUST_LIMITS.photo_saturation.fallback),
    thermal_density: Number(row.thermal_density ?? PHOTO_ADJUST_LIMITS.thermal_density.fallback),
    thermal_offset_y_px: Number(row.thermal_offset_y_px ?? PHOTO_ADJUST_LIMITS.thermal_offset_y_px.fallback),
    photo_fit_mode: row.photo_fit_mode || 'fit',
  };
}

module.exports = {
  ADAPTERS,
  PAPER_SIZES,
  ORIENTATIONS,
  ALLOWED_FIELDS,
  FORBIDDEN_FIELDS,
  PHOTO_ADJUST_LIMITS,
  PHOTO_FIT_MODES,
  PrintingConfigValidationError,
  validatePrintingConfig,
  toSocketPrintingConfig,
};
