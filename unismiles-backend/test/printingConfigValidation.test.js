const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validatePrintingConfig,
  PrintingConfigValidationError,
} = require('../utils/printingConfigValidation');

const supported = {
  supported_adapters: ['disabled', 'cups', 'mock'],
  available_printers: [{ name: 'Canon SELPHY CP1500', status: 'READY' }],
};

test('normalizes disabled printing and clears adapter/printer', () => {
  assert.deepEqual(validatePrintingConfig({ printing_enabled: false, adapter: 'cups', printer_name: 'ignored' }), {
    printing_enabled: false,
    adapter: 'disabled',
    printer_name: null,
    paper_size: '4R',
    orientation: 'portrait',
    copies_limit: 1,
    timeout_ms: 60000,
    retry_count: 2,
  });
});

test('rejects unsupported adapter and arbitrary command fields', () => {
  assert.throws(() => validatePrintingConfig({ adapter: 'shell' }), PrintingConfigValidationError);
  assert.throws(() => validatePrintingConfig({ command: 'lp' }), /not accepted/);
  assert.throws(() => validatePrintingConfig({ executable_path: '/usr/bin/lp' }), /not accepted/);
});

test('rejects copies and timeout outside policy', () => {
  assert.throws(() => validatePrintingConfig({ copies_limit: 11 }), /copies_limit/);
  assert.throws(() => validatePrintingConfig({ timeout_ms: 4999 }), /timeout_ms/);
  assert.throws(() => validatePrintingConfig({ retry_count: 4 }), /retry_count/);
});

test('requires reported supported adapter and printer when enabling', () => {
  assert.throws(() => validatePrintingConfig({ printing_enabled: true, adapter: 'windows', printer_name: 'X' }, {}, supported), /not supported/);
  assert.throws(() => validatePrintingConfig({ printing_enabled: true, adapter: 'cups', printer_name: 'Other Printer' }, {}, supported), /not reported/);
  assert.deepEqual(validatePrintingConfig({ printing_enabled: true, adapter: 'cups', printer_name: 'Canon SELPHY CP1500' }, {}, supported).printing_enabled, true);
});
