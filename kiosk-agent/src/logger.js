function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;

  return Object.entries(value).reduce((result, [key, item]) => {
    if (/api.?key|token|authorization|password|secret/i.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitize(item);
    }
    return result;
  }, {});
}

function write(level, event, fields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitize(fields),
  };

  const output = JSON.stringify(entry);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}

module.exports = {
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields),
  sanitize,
};
