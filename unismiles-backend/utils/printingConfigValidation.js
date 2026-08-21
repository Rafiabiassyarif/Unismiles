const ADAPTERS = ['disabled', 'cups', 'windows', 'mock'];
const PAPER_SIZES = [
  'Instax Mini (54 × 86 mm)', 'Polaroid 6 × 9 cm (2R)', '2 Strip 5 × 15 cm', '3 Strip 5 × 15 cm', 
  '4 Strip 5 × 15 cm', '2×2 Grid 10 × 10 cm', '2×3 Grid 10 × 15 cm'
];
const ORIENTATIONS = ['portrait', 'landscape'];
const FORBIDDEN_FIELDS = new Set(['command', 'shell_command', 'executable_path', 'script', 'driver_command']);
const ALLOWED_FIELDS = new Set([
  'printing_enabled', 'adapter', 'printer_name', 'paper_size', 'orientation',
  'copies_limit', 'timeout_ms', 'retry_count', 'allowed_layouts',
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
    ...input,
  };

  const enabled = Boolean(merged.printing_enabled);
  const adapter = typeof merged.adapter === 'string' ? merged.adapter.toLowerCase() : '';
  if (!ADAPTERS.includes(adapter)) {
    throw new PrintingConfigValidationError(`adapter must be one of: ${ADAPTERS.join(', ')}.`);
  }
  if (!PAPER_SIZES.includes(merged.paper_size)) {
    throw new PrintingConfigValidationError(`paper_size must be one of: ${PAPER_SIZES.join(', ')}.`);
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
  };
}

module.exports = {
  ADAPTERS,
  PAPER_SIZES,
  ORIENTATIONS,
  ALLOWED_FIELDS,
  FORBIDDEN_FIELDS,
  PrintingConfigValidationError,
  validatePrintingConfig,
  toSocketPrintingConfig,
};
