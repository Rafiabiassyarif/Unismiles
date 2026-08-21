const crypto = require('crypto');

function csv(value, fallback = []) {
  const values = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return values.length ? values : fallback;
}

function allowedOrigins() {
  const defaults = process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003'];
  return csv(process.env.CORS_ORIGINS || process.env.ADMIN_ORIGINS, defaults)
    .filter(origin => origin !== '*');
}

function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return callback(null, true);
  if (allowedOrigins().includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS'));
}

function publicBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || process.env.SERVER_URL;
  try {
    const configuredUrl = new URL(String(configured));
    if (!['example.com', 'api.example.com'].includes(configuredUrl.hostname)) {
      return configuredUrl.toString().replace(/\/$/, '');
    }
  } catch (_) {}

  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0].trim();
  const protocol = forwardedProtocol || req.protocol;
  const host = forwardedHost || req.get('host');
  return `${protocol}://${host}`.replace(/\/$/, '');
}

function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function createRateLimiter({ windowMs = 60_000, max = 60, keyGenerator } = {}) {
  const buckets = new Map();
  let lastCleanup = Date.now();

  return (req, res, next) => {
    const now = Date.now();
    if (now - lastCleanup > windowMs * 2) {
      for (const [key, bucket] of buckets) {
        if (now - bucket.startedAt >= windowMs) buckets.delete(key);
      }
      lastCleanup = now;
    }

    const key = keyGenerator ? keyGenerator(req) : (req.ip || req.socket.remoteAddress || 'unknown');
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      buckets.set(key, { startedAt: now, count: 1 });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - bucket.startedAt)) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: `Too many requests. Please try again in ${retryAfterSeconds} seconds.`,
        code: 'RATE_LIMITED',
        retry_after_seconds: retryAfterSeconds,
      });
    }
    return next();
  };
}

function requestId(req, res, next) {
  const id = req.get('x-request-id') || crypto.randomUUID();
  req.requestId = id;
  res.set('x-request-id', id);
  next();
}

module.exports = {
  allowedOrigins,
  corsOrigin,
  publicBaseUrl,
  isValidEmail,
  escapeHtml,
  createRateLimiter,
  requestId,
};
