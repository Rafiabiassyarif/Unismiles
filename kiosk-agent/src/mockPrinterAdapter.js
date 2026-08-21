const { PrinterAdapter } = require('./printerAdapter');

class MockPrinterAdapter extends PrinterAdapter {
  constructor({ printerName = 'Mock Printer' } = {}) {
    super();
    this.printerName = printerName || 'Mock Printer';
  }

  async checkPrinter() { return { exists: true, online: true, status: 'READY', printerName: this.printerName }; }
  async printImage() { return { accepted: true, requestId: `mock-${Date.now()}`, printerName: this.printerName }; }
  async getStatus() { return { status: 'READY' }; }
  async getPaperStatus() { return { status: 'NORMAL', remaining: null }; }
  async listPrinters() { return [{ name: this.printerName, status: 'READY' }]; }
}

module.exports = MockPrinterAdapter;
