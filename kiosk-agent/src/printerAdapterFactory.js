const { DisabledPrinterAdapter } = require('./printerAdapter');
const MacOSPrinterAdapter = require('./macosPrinterAdapter');
const WindowsPrinterAdapter = require('./windowsPrinterAdapter');
const MockPrinterAdapter = require('./mockPrinterAdapter');

/**
 * Nama adapter yang dikenal sistem.
 *
 * `thermal` untuk printer label termal (mis. NIIMBOT B1 Pro). Di sistem operasi
 * printer itu tetap muncul sebagai printer biasa, jadi adapter thermal memakai
 * driver printer yang sama dengan adapter OS — yang berbeda hanya penanganan
 * ukuran kertas: lebarnya dibatasi lebar cetak efektif (48 mm), bukan ukuran foto.
 */
const SUPPORTED_ADAPTER_NAMES = ['disabled', 'cups', 'windows', 'mock', 'thermal'];

function supportedAdapters() {
  const values = ['disabled', 'mock'];
  if (process.platform === 'win32') values.push('windows');
  if (process.platform === 'darwin' || process.platform === 'linux') values.push('cups');
  // Thermal memakai jalur printer OS, jadi ketersediaannya mengikuti OS.
  values.push('thermal');
  return values;
}

function createPrinterAdapter(config = {}) {
  const adapter = String(config.adapter || 'disabled').toLowerCase();

  // Thermal = printer OS, dengan ukuran kertas termal.
  if (adapter === 'thermal') {
    if (process.platform === 'win32') return new WindowsPrinterAdapter(config);
    if (process.platform === 'darwin' || process.platform === 'linux') return new MacOSPrinterAdapter(config);
    throw new Error('Thermal adapter needs a supported OS printer backend (cups/windows)');
  }
  if (adapter === 'cups') {
    if (!supportedAdapters().includes('cups')) throw new Error('CUPS adapter is not supported on this operating system');
    return new MacOSPrinterAdapter(config);
  }
  if (adapter === 'windows') {
    if (!supportedAdapters().includes('windows')) throw new Error('Windows adapter is not supported on this operating system');
    return new WindowsPrinterAdapter(config);
  }
  if (adapter === 'mock') return new MockPrinterAdapter(config);
  if (adapter === 'disabled') return new DisabledPrinterAdapter('Printing is disabled by kiosk configuration');
  throw new Error(`Unsupported printer adapter: ${adapter}`);
}

async function discoverPrinters({ timeoutMs = 60000 } = {}) {
  const discovered = [];
  if (supportedAdapters().includes('cups')) {
    const cups = new MacOSPrinterAdapter({ printerName: null, timeoutMs });
    discovered.push(...await cups.listPrinters());
  }
  if (supportedAdapters().includes('windows')) {
    const windows = new WindowsPrinterAdapter({ printerName: null, timeoutMs });
    discovered.push(...await windows.listPrinters());
  }
  if (supportedAdapters().includes('mock')) discovered.push({ name: 'Mock Printer', status: 'READY' });
  return Array.from(new Map(discovered.filter(item => item?.name).map(item => [item.name, item])).values());
}

module.exports = { createPrinterAdapter, supportedAdapters, discoverPrinters, SUPPORTED_ADAPTER_NAMES };
