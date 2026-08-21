const assert = require('node:assert/strict');
const test = require('node:test');
const KioskWSClient = require('../src/wsClient');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');

class FakePrinterAdapter {
  constructor({ check = { exists: true, online: true }, print, paper = { status: 'NORMAL', remaining: 99 } } = {}) {
    this.checkResult = check;
    this.printImpl = print || (async () => ({ requestId: 'fake-1' }));
    this.paper = paper;
    this.printCalls = [];
  }

  async checkPrinter() { return this.checkResult; }
  async printImage(filePath, options) {
    this.printCalls.push({ filePath, options });
    return this.printImpl(filePath, options);
  }
  async getStatus() { return { status: 'READY' }; }
  async getPaperStatus() { return this.paper; }
  async close() {}
}

function fakeFetch(body = PNG, contentType = 'image/png') {
  return async () => {
    let consumed = false;
    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          if (name === 'content-type') return contentType;
          if (name === 'content-length') return String(body.length);
          return null;
        },
      },
      body: {
        getReader() {
          return {
            async read() {
              if (consumed) return { done: true };
              consumed = true;
              return { done: false, value: new Uint8Array(body) };
            },
            releaseLock() {},
          };
        },
      },
    };
  };
}

function createClient(adapter, timeoutMs = 1000, fetchImpl = fakeFetch()) {
  const client = new KioskWSClient({
    backendUrl: 'http://localhost:8000',
    deviceId: 'TEST-KIOSK',
    deviceToken: 'test-secret',
    printerAdapter: adapter,
    printerConfig: {
      printerName: 'Trusted Fake Printer',
      paperSize: '4R',
      orientation: 'portrait',
      copiesLimit: 2,
      timeoutMs,
      retryCount: 0,
    },
    fetchImpl,
  });
  const events = [];
  client.socket = { emit: (event, payload) => events.push({ event, payload }), disconnect() {} };
  return { client, events };
}

test('PRINT_PHOTO success downloads, prints, reports printing and final result', async () => {
  const url = 'http://localhost:8000/uploads/final-photo.png';
  const adapter = new FakePrinterAdapter();
  const { client, events } = createClient(adapter);

  await client.processCommand({ command: 'PRINT_PHOTO', commandId: 'cmd-1', payload: {
    job_id: 'job-success', image_url: url, copies: 1, paper_size: '4R', orientation: 'portrait',
  } });
  assert.equal(adapter.printCalls.length, 1);
  assert.deepEqual(adapter.printCalls[0].options, { copies: 1, paperSize: '4R', orientation: 'portrait' });
  const results = events.filter((event) => event.event === 'kiosk:command_result').map((event) => event.payload);
  assert.deepEqual(results.map((result) => result.status), ['printing', 'success']);
  assert.equal(results[1].success, true);
  assert.equal(results[1].paper_stock_left, 99);
});

test('offline printer returns PRINTER_OFFLINE and does not download or print', async () => {
  const adapter = new FakePrinterAdapter({ check: { exists: true, online: false, errorCode: 'PRINTER_OFFLINE' } });
  const { client, events } = createClient(adapter);
  await client.processCommand({ command: 'PRINT_PHOTO', payload: {
    job_id: 'job-offline', image_url: 'http://127.0.0.1:1/not-used.png', copies: 1,
  } });

  const result = events.at(-1).payload;
  assert.equal(result.error_code, 'PRINTER_OFFLINE');
  assert.equal(adapter.printCalls.length, 0);
});

test('invalid image MIME/signature fails before printing', async () => {
  const url = 'http://localhost:8000/uploads/final-photo.png';
  const adapter = new FakePrinterAdapter();
  const { client, events } = createClient(adapter, 1000, fakeFetch(Buffer.from('not an image'), 'text/plain'));
  await client.processCommand({ command: 'PRINT_PHOTO', payload: {
    job_id: 'job-invalid', image_url: url, copies: 1,
  } });
  assert.equal(events.at(-1).payload.error_code, 'IMAGE_INVALID');
  assert.equal(adapter.printCalls.length, 0);
});

test('non-http and traversal image URLs fail before fetch/print', async () => {
  const adapter = new FakePrinterAdapter();
  const fetchImpl = async () => { throw new Error('fetch must not be called'); };
  const { client, events } = createClient(adapter, 1000, fetchImpl);
  await client.processCommand({ command: 'PRINT_PHOTO', payload: {
    job_id: 'job-unsafe-url', image_url: 'file:///tmp/../secret.png', copies: 1,
  } });

  assert.equal(events.at(-1).payload.error_code, 'IMAGE_DOWNLOAD_FAILED');
  assert.equal(adapter.printCalls.length, 0);
});

test('duplicate job is reported and never printed twice', async () => {
  const url = 'http://localhost:8000/uploads/final-photo.png';
  let releasePrint;
  const printStarted = new Promise((resolve) => {
    releasePrint = () => resolve({ requestId: 'fake-duplicate' });
  });
  const adapter = new FakePrinterAdapter({ print: () => printStarted });
  const { client, events } = createClient(adapter, 2000);
  const command = { command: 'PRINT_PHOTO', payload: { job_id: 'job-duplicate', image_url: url, copies: 1 } };
  const first = client.processCommand(command);
  while (adapter.printCalls.length === 0) await new Promise((resolve) => setImmediate(resolve));
  await client.processCommand(command);
  releasePrint();
  await first;
  assert.equal(adapter.printCalls.length, 1);
  assert.ok(events.some((event) => event.payload.status === 'duplicate'));
  assert.equal(events.filter((event) => event.payload.status === 'success').length, 1);
});

test('failed printer result is returned as PRINT_FAILED', async () => {
  const url = 'http://localhost:8000/uploads/final-photo.png';
  const failure = new Error('driver rejected job');
  failure.code = 'PRINTER_COMMAND_FAILED';
  const adapter = new FakePrinterAdapter({ print: async () => { throw failure; } });
  const { client, events } = createClient(adapter);
  await client.processCommand({ command: 'PRINT_PHOTO', payload: {
    job_id: 'job-failed', image_url: url, copies: 1,
  } });
  assert.equal(events.at(-1).payload.success, false);
  assert.equal(events.at(-1).payload.error_code, 'PRINTER_COMMAND_FAILED');
});

test('printer timeout returns PRINT_TIMEOUT', async () => {
  const url = 'http://localhost:8000/uploads/final-photo.png';
  const adapter = new FakePrinterAdapter({ print: () => new Promise(() => {}) });
  const { client, events } = createClient(adapter, 25);
  await client.processCommand({ command: 'PRINT_PHOTO', payload: {
    job_id: 'job-timeout', image_url: url, copies: 1,
  } });
  assert.equal(events.at(-1).payload.error_code, 'PRINT_TIMEOUT');
});

test('printing configuration can switch to the injected mock adapter at runtime', async () => {
  const adapter = new FakePrinterAdapter();
  const { client } = createClient(adapter);
  await client.handleConfigUpdate({ printing: {
    enabled: true,
    adapter: 'mock',
    printer_name: 'Mock Printer',
    paper_size: '4R',
    orientation: 'portrait',
    copies_limit: 2,
    timeout_ms: 5000,
    retry_count: 0,
    config_version: 7,
  } });

  assert.equal(client.printerConfig.adapter, 'mock');
  assert.equal(client.printerConfig.enabled, true);
  assert.equal(client.reportedState.printing.config_version, 7);
  assert.equal(client.reportedState.printing.printer_name, 'Mock Printer');
});
