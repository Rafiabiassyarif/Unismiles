const { spawn } = require('child_process');
const path = require('path');
const { PrinterAdapter } = require('./printerAdapter');

const POWERSHELL_SCRIPT = path.join(__dirname, 'windows-print.ps1');

function validatePrinterName(printerName) {
  if (!printerName) return;
  if (typeof printerName !== 'string' || printerName.length > 256 || /[\u0000-\u001f\u007f]/.test(printerName)) {
    const error = new Error('Invalid Windows printer name');
    error.code = 'PRINTER_NOT_FOUND';
    throw error;
  }
}

function runPowerShell(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-File',
      POWERSHELL_SCRIPT,
      ...args,
    ], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finishError = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      const error = new Error('Windows printer operation timed out');
      error.code = 'PRINT_TIMEOUT';
      finishError(error);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      error.code = error.code === 'ENOENT' ? 'PRINTER_NOT_FOUND' : error.code;
      finishError(error);
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      clearTimeout(timer);
      if (code === 0) {
        settled = true;
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(stderr.trim() || `Windows printer exited with code ${code}`);
      error.code = code === 2 ? 'PRINTER_NOT_FOUND' : code === 3 || signal ? 'PRINTER_OFFLINE' : 'PRINTER_COMMAND_FAILED';
      error.stderr = stderr;
      finishError(error);
    });
  });
}

function parseJson(stdout, fallback) {
  if (!stdout.trim()) return fallback;
  try {
    return JSON.parse(stdout.trim());
  } catch (error) {
    error.code = 'PRINTER_COMMAND_FAILED';
    throw error;
  }
}

class WindowsPrinterAdapter extends PrinterAdapter {
  constructor({ printerName, timeoutMs = 60000 } = {}) {
    super();
    this.printerName = printerName || null;
    this.timeoutMs = timeoutMs;
    validatePrinterName(this.printerName);
  }

  async checkPrinter() {
    if (process.platform !== 'win32') {
      return { exists: false, online: false, errorCode: 'PRINTER_NOT_FOUND' };
    }
    if (!this.printerName) {
      return { exists: false, online: false, errorCode: 'PRINTER_NOT_CONFIGURED' };
    }

    try {
      const result = await runPowerShell(['-Action', 'status', '-PrinterName', this.printerName], this.timeoutMs);
      const printer = parseJson(result.stdout, null);
      if (!printer || printer.status === 'NOT_FOUND') {
        return { exists: false, online: false, errorCode: 'PRINTER_NOT_FOUND', printerName: this.printerName };
      }
      if (printer.status !== 'READY') {
        return { exists: true, online: false, errorCode: 'PRINTER_OFFLINE', printerName: this.printerName };
      }
      return { exists: true, online: true, status: 'READY', printerName: this.printerName };
    } catch (error) {
      if (error.code === 'PRINT_TIMEOUT') throw error;
      return {
        exists: error.code !== 'PRINTER_NOT_FOUND',
        online: false,
        errorCode: error.code === 'PRINTER_NOT_FOUND' ? 'PRINTER_NOT_FOUND' : 'PRINTER_OFFLINE',
        printerName: this.printerName,
      };
    }
  }

  async printImage(filePath, options = {}) {
    if (process.platform !== 'win32') {
      const error = new Error('Windows printer adapter is only available on Windows');
      error.code = 'PRINTER_NOT_FOUND';
      throw error;
    }
    validatePrinterName(this.printerName);
    const result = await runPowerShell([
      '-Action', 'print',
      '-PrinterName', this.printerName,
      '-FilePath', path.resolve(filePath),
      '-Copies', String(options.copies),
      '-PaperSize', String(options.paperSize),
      '-Orientation', String(options.orientation),
    ], this.timeoutMs);
    return parseJson(result.stdout, { accepted: true, requestId: null, printerName: this.printerName });
  }

  async getStatus() {
    const checked = await this.checkPrinter();
    if (checked.errorCode === 'PRINTER_NOT_CONFIGURED') return { status: 'NOT_CONFIGURED', errorCode: checked.errorCode };
    if (!checked.exists) return { status: 'NOT_FOUND', errorCode: 'PRINTER_NOT_FOUND' };
    if (!checked.online) return { status: 'OFFLINE', errorCode: 'PRINTER_OFFLINE' };
    return { status: 'READY' };
  }

  async getPaperStatus() {
    // Windows Print Spooler does not expose paper count consistently across drivers.
    return { status: 'UNKNOWN', remaining: null };
  }

  async listPrinters() {
    if (process.platform !== 'win32') return [];
    const result = await runPowerShell(['-Action', 'list'], this.timeoutMs);
    const printers = parseJson(result.stdout, []);
    return (Array.isArray(printers) ? printers : [printers]).filter(Boolean).map((printer) => ({
      name: printer.name,
      status: printer.status || 'UNKNOWN',
      driver_name: printer.driver_name || null,
      port_name: printer.port_name || null,
    }));
  }
}

module.exports = WindowsPrinterAdapter;
