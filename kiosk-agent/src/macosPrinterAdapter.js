const { spawn } = require('child_process');
const { PrinterAdapter } = require('./printerAdapter');

function runFile(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      const error = new Error(`${command} timed out`);
      error.code = 'PRINT_TIMEOUT';
      rejectOnce(error);
    }, timeoutMs);

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      error.code = error.code === 'ENOENT' ? 'PRINTER_NOT_FOUND' : error.code;
      rejectOnce(error);
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const error = new Error(stderr.trim() || `Command exited with code ${code}`);
        error.code = signal ? 'PRINTER_OFFLINE' : 'PRINTER_COMMAND_FAILED';
        error.exitCode = code;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

function parsePrinterStatus(output) {
  const normalized = output.toLowerCase();
  const offline = /disabled|offline|not responding|unavailable|stopped|paused|rejecting/.test(normalized);
  return { online: !offline, status: offline ? 'OFFLINE' : 'READY' };
}

class MacOSPrinterAdapter extends PrinterAdapter {
  constructor({ printerName, timeoutMs = 60000, pollIntervalMs = 1000 } = {}) {
    super();
    this.printerName = printerName;
    this.timeoutMs = timeoutMs;
    this.pollIntervalMs = pollIntervalMs;
  }

  async checkPrinter() {
    if (!this.printerName) return { exists: false, online: false, errorCode: 'PRINTER_NOT_CONFIGURED' };

    try {
      const result = await runFile('lpstat', ['-p', this.printerName], this.timeoutMs);
      const status = parsePrinterStatus(result.stdout);
      return { exists: true, online: status.online, status: status.status, printerName: this.printerName };
    } catch (error) {
      if (error.code === 'PRINTER_NOT_FOUND' || (error.code === 'PRINTER_COMMAND_FAILED' && /unknown|not found|no destinations|does not exist/i.test(error.message))) {
        return { exists: false, online: false, errorCode: 'PRINTER_NOT_FOUND', printerName: this.printerName };
      }
      if (error.code === 'PRINT_TIMEOUT') throw error;
      return { exists: true, online: false, errorCode: 'PRINTER_OFFLINE', printerName: this.printerName };
    }
  }

  async printImage(filePath, options = {}) {
    const args = ['-d', this.printerName, '-n', String(options.copies), '-o', `media=${options.paperSize}`];
    if (options.orientation === 'landscape') args.push('-o', 'orientation-requested=4');
    else args.push('-o', 'orientation-requested=3');
    args.push(filePath);

    const result = await runFile('lp', args, this.timeoutMs);
    const match = result.stdout.match(/request id is ([^\s]+)/i);
    const requestId = match ? match[1] : null;
    if (requestId) await this.waitForCompletion(requestId);

    return { accepted: true, requestId, printerName: this.printerName };
  }

  async waitForCompletion(requestId) {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      try {
        const result = await runFile('lpstat', ['-W', 'not-completed', '-o', this.printerName], this.timeoutMs);
        if (!result.stdout.includes(requestId)) return;
      } catch (error) {
        if (error.code === 'PRINTER_COMMAND_FAILED') return;
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    const error = new Error('Printer job timed out');
    error.code = 'PRINT_TIMEOUT';
    throw error;
  }

  async getStatus() {
    const checked = await this.checkPrinter();
    if (!checked.exists) return { status: 'NOT_FOUND', errorCode: 'PRINTER_NOT_FOUND' };
    if (!checked.online) return { status: 'OFFLINE', errorCode: 'PRINTER_OFFLINE' };
    return { status: 'READY' };
  }

  async getPaperStatus() {
    if (!this.printerName) return { status: 'UNKNOWN', remaining: null };
    try {
      const result = await runFile('lpstat', ['-p', this.printerName, '-l'], this.timeoutMs);
      const match = result.stdout.match(/(media|paper)[^\n]*\b(out|empty|low|normal|loaded)\b/i);
      return { status: match ? match[2].toUpperCase() : 'UNKNOWN', remaining: null };
    } catch (error) {
      return { status: error.code === 'PRINTER_OFFLINE' ? 'OFFLINE' : 'UNKNOWN', remaining: null };
    }
  }

  async listPrinters() {
    try {
      const result = await runFile('lpstat', ['-a'], this.timeoutMs);
      return result.stdout.split(/\r?\n/).map(line => line.trim().split(/\s+/, 1)[0]).filter(Boolean)
        .map(name => ({ name, status: name === this.printerName ? 'READY' : 'UNKNOWN' }));
    } catch (_) {
      return [];
    }
  }
}

module.exports = MacOSPrinterAdapter;
