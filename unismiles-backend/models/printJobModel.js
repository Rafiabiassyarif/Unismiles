const pool = require('../config/db');

const TERMINAL_STATUSES = new Set(['success', 'failed']);

function formatPrintJob(row) {
  if (!row) return null;
  return {
    job_id: row.job_id,
    session_code: row.session_code,
    status: row.status,
    copies: Number(row.copies),
    printer_name: row.printer_name || null,
    error_code: row.error_code || null,
    error_message: row.error_message || null,
    created_at: row.created_at,
    completed_at: row.completed_at || null,
    started_at: row.started_at || null,
    kiosk_id: row.kiosk_id,
    image_url: row.image_url,
    paper_size: row.paper_size,
    orientation: row.orientation,
    idempotency_key: row.idempotency_key || null,
  };
}

const printJobModel = {
  TERMINAL_STATUSES,
  formatPrintJob,

  async create(job) {
    await pool.query(
      `INSERT INTO print_jobs
       (job_id, kiosk_id, session_id, session_code, image_url, copies, paper_size, orientation, status, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
      [job.job_id, job.kiosk_id, job.session_id, job.session_code, job.image_url,
        job.copies, job.paper_size, job.orientation, job.idempotency_key || null]
    );
    return this.findById(job.job_id);
  },

  async findById(jobId) {
    const [rows] = await pool.query('SELECT * FROM print_jobs WHERE job_id = ? LIMIT 1', [jobId]);
    return rows[0] || null;
  },

  async findByIdForKiosk(jobId, kioskId) {
    const [rows] = await pool.query(
      'SELECT * FROM print_jobs WHERE job_id = ? AND kiosk_id = ? LIMIT 1',
      [jobId, kioskId]
    );
    return rows[0] || null;
  },

  async findByIdempotencyKey(kioskId, idempotencyKey) {
    if (!idempotencyKey) return null;
    const [rows] = await pool.query(
      'SELECT * FROM print_jobs WHERE kiosk_id = ? AND idempotency_key = ? LIMIT 1',
      [kioskId, idempotencyKey]
    );
    return rows[0] || null;
  },

  async markFailedIfPending(jobId, kioskId, errorCode, errorMessage) {
    const [result] = await pool.query(
      `UPDATE print_jobs
       SET status = 'failed', error_code = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP
       WHERE job_id = ? AND kiosk_id = ? AND status NOT IN ('success', 'failed')`,
      [errorCode, errorMessage, jobId, kioskId]
    );
    return result.affectedRows ? this.findById(jobId) : null;
  },

  async updateFromCommandResult(jobId, kioskId, result) {
    const started = result.status === 'printing' || result.status === 'success' || result.success === true;
    const terminal = result.status === 'success' || result.status === 'failed' || result.success === true || result.success === false;
    const completedAt = result.completed_at && !Number.isNaN(Date.parse(result.completed_at))
      ? new Date(result.completed_at)
      : null;

    const [dbResult] = await pool.query(
      `UPDATE print_jobs
       SET status = ?,
           printer_name = COALESCE(?, printer_name),
           error_code = ?,
           error_message = ?,
           started_at = CASE WHEN ? = 1 AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END,
           completed_at = CASE WHEN ? = 1 THEN COALESCE(?, CURRENT_TIMESTAMP) ELSE completed_at END
       WHERE job_id = ? AND kiosk_id = ? AND status NOT IN ('success', 'failed')`,
      [result.status, result.printer_name || null, result.error_code || null, result.error_message || null,
        started ? 1 : 0, terminal ? 1 : 0, completedAt, jobId, kioskId]
    );
    return dbResult.affectedRows ? this.findById(jobId) : null;
  },
};

module.exports = printJobModel;
