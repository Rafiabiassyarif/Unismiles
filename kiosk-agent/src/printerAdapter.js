class PrinterAdapter {
  async checkPrinter() {
    throw new Error('PrinterAdapter.checkPrinter() is not implemented');
  }

  async printImage() {
    throw new Error('PrinterAdapter.printImage() is not implemented');
  }

  async getStatus() {
    throw new Error('PrinterAdapter.getStatus() is not implemented');
  }

  async getPaperStatus() {
    throw new Error('PrinterAdapter.getPaperStatus() is not implemented');
  }

  async listPrinters() { return []; }

  async close() {}
}

class DisabledPrinterAdapter extends PrinterAdapter {
  constructor(reason = 'Printing is disabled') {
    super();
    this.reason = reason;
  }

  async checkPrinter() {
    return { exists: false, online: false, errorCode: 'PRINTER_NOT_CONFIGURED', reason: this.reason };
  }

  async getStatus() {
    return { status: 'NOT_CONFIGURED', errorCode: 'PRINTER_NOT_CONFIGURED' };
  }

  async getPaperStatus() {
    return { status: 'UNKNOWN', remaining: null };
  }

  async listPrinters() { return []; }
}

module.exports = { PrinterAdapter, DisabledPrinterAdapter };
