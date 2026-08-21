const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePrintRequest } = require('../utils/printValidation');
const { handlePrintCommandResult } = require('../services/printJobService');
const { createPrintJobController } = require('../controllers/printJobController');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function sessionModel() {
  return { findByCodeAndKiosk: async () => ({ id: '#US-123', session_code: '#US-123' }) };
}

function jobModel(overrides = {}) {
  const job = {
    job_id: 'job-1', kiosk_id: 'K-001', session_id: '#US-123', session_code: '#US-123',
    image_url: 'http://localhost:8000/uploads/final-photo.png', copies: 1,
    paper_size: '4R', orientation: 'portrait', status: 'queued',
    created_at: new Date(), ...overrides,
  };
  return {
    job,
    findByIdempotencyKey: async () => null,
    create: async () => job,
    markFailedIfPending: async (_id, _kiosk, code, message) => ({ ...job, status: 'failed', error_code: code, error_message: message }),
    findByIdForKiosk: async () => job,
    formatPrintJob: row => row,
  };
}

test('validates and normalizes a print request', () => {
  assert.deepEqual(normalizePrintRequest({
    image_url: '/uploads/final-photo.png', copies: '2', orientation: 'landscape', idempotency_key: 'client-1',
  }), {
    image_url: '/uploads/final-photo.png', copies: 2, paper_size: '4R', orientation: 'landscape', idempotency_key: 'client-1',
  });
  assert.throws(() => normalizePrintRequest({ image_url: 'file:///tmp/photo.png' }), /valid HTTP/);
  assert.throws(() => normalizePrintRequest({ image_url: 'http://localhost/photo.png', copies: 4 }), /between 1 and 3/);
});

test('returns a consistent offline response and does not dispatch', async () => {
  const jobs = jobModel();
  let dispatched = false;
  const controller = createPrintJobController({
    printJobModel: jobs,
    sessionModel: sessionModel(),
    isKioskConnected: () => false,
    sendKioskCommand: () => { dispatched = true; },
  });
  const res = response();
  await controller.createPrintJob({
    params: { session_code: '#US-123' }, kiosk: { id: 'K-001' },
    body: { image_url: 'http://localhost:8000/uploads/final-photo.png' },
  }, res, error => { throw error; });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error_code, 'KIOSK_OFFLINE');
  assert.equal(dispatched, false);
});

test('returns the existing job for a duplicate idempotency key', async () => {
  const jobs = jobModel({ job_id: 'existing-job', idempotency_key: 'same-key' });
  jobs.findByIdempotencyKey = async () => jobs.job;
  let dispatched = false;
  const controller = createPrintJobController({
    printJobModel: jobs, sessionModel: sessionModel(), isKioskConnected: () => true,
    sendKioskCommand: () => { dispatched = true; },
  });
  const res = response();
  await controller.createPrintJob({
    params: { session_code: '#US-123' }, kiosk: { id: 'K-001' },
    body: { image_url: jobs.job.image_url, idempotency_key: 'same-key' },
  }, res, error => { throw error; });
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.data.job_id, 'existing-job');
  assert.equal(dispatched, false);
});

test('queues a job only after the kiosk is online', async () => {
  const jobs = jobModel();
  let command;
  const controller = createPrintJobController({
    printJobModel: jobs, sessionModel: sessionModel(), isKioskConnected: () => true,
    sendKioskCommand: (_id, name, payload) => { command = { name, payload }; return true; },
    schedulePrintJobTimeout: () => {},
  });
  const res = response();
  await controller.createPrintJob({
    params: { session_code: '#US-123' }, kiosk: { id: 'K-001' },
    body: { image_url: jobs.job.image_url, idempotency_key: 'key-1' },
  }, res, error => { throw error; });
  assert.equal(res.statusCode, 202);
  assert.equal(command.name, 'PRINT_PHOTO');
  assert.equal(command.payload.job_id, 'job-1');
});

test('updates print jobs for successful and failed agent results', async () => {
  for (const result of [
    { success: true, status: 'success', paper_stock_left: 99 },
    { success: false, status: 'failed', error_code: 'PRINTER_OFFLINE', error_message: 'Printer tidak tersedia' },
  ]) {
    let update;
    const jobs = {
      findByIdForKiosk: async () => ({ job_id: 'job-1', copies: 1, status: 'queued' }),
      updateFromCommandResult: async (_id, _kiosk, normalized) => {
        update = normalized;
        return { ...normalized, job_id: 'job-1', copies: 1 };
      },
    };
    let stock;
    const outcome = await handlePrintCommandResult({
      kioskId: 'K-001', result: { command: 'PRINT_PHOTO', job_id: 'job-1', ...result },
      dependencies: { printJobModel: jobs, kioskModel: { updatePrintsRemaining: async (...args) => { stock = args; } } },
    });
    assert.equal(outcome.updated, true);
    assert.equal(update.status, result.success ? 'success' : 'failed');
    if (result.success) assert.equal(stock[2], 99);
  }
});
