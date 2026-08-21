const printJobModel = require('../models/printJobModel');
const kioskModel = require('../models/kioskModel');
const { clearPrintJobTimeout } = require('../utils/printJobLifecycle');

function normalizeCommandResult(result = {}) {
  const status = result.status === 'printing' ? 'printing'
    : (result.success === true || result.status === 'success' ? 'success' : 'failed');
  return { ...result, status };
}

async function handlePrintCommandResult({ kioskId, result, dependencies = {} }) {
  const jobs = dependencies.printJobModel || printJobModel;
  const kiosks = dependencies.kioskModel || kioskModel;
  const normalized = normalizeCommandResult(result);
  const jobId = result.job_id || result.payload?.job_id;

  if (!jobId) return { updated: false, reason: 'missing_job_id' };

  const existing = await jobs.findByIdForKiosk(jobId, kioskId);
  if (!existing) return { updated: false, reason: 'job_not_found' };

  const updated = await jobs.updateFromCommandResult(jobId, kioskId, normalized);
  if (!updated) return { updated: false, reason: 'job_already_completed' };

  if (normalized.status === 'success') {
    await kiosks.updatePrintsRemaining(kioskId, updated.copies, result.paper_stock_left);
  }
  if (normalized.status === 'success' || normalized.status === 'failed') {
    clearPrintJobTimeout(jobId);
  }

  return { updated: true, job: updated };
}

module.exports = { normalizeCommandResult, handlePrintCommandResult };
