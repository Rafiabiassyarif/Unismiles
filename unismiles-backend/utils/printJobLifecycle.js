const printJobModel = require('../models/printJobModel');

const timers = new Map();
const DEFAULT_TIMEOUT_MS = 60 * 1000;

function clearPrintJobTimeout(jobId) {
  const timer = timers.get(jobId);
  if (timer) clearTimeout(timer);
  timers.delete(jobId);
}

function schedulePrintJobTimeout(jobId, kioskId, options = {}) {
  clearPrintJobTimeout(jobId);
  const timeoutMs = options.timeoutMs || Number(process.env.PRINT_JOB_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(async () => {
    timers.delete(jobId);
    try {
      const job = await printJobModel.markFailedIfPending(jobId, kioskId, 'PRINT_TIMEOUT', `Kiosk did not finish printing within ${timeoutMs} ms.`);
      if (job && options.onTimeout) await options.onTimeout(job);
    } catch (error) {
      console.error(`[Print] Failed to mark timed out job ${jobId}:`, error);
    }
  }, timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  timers.set(jobId, timer);
}

module.exports = { DEFAULT_TIMEOUT_MS, schedulePrintJobTimeout, clearPrintJobTimeout };
