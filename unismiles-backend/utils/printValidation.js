class PrintValidationError extends Error {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'PrintValidationError';
    this.statusCode = 400;
    this.code = code;
  }
}

function validImageReference(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    // Local upload paths are accepted, but filesystem paths and commands are not.
    return !value.split('/').includes('..') &&
      /^(?:\/?uploads|\/?assets)\/[A-Za-z0-9._%/\-]+(?:\?[A-Za-z0-9._%=&\-]+)?$/.test(value);
  }
}

function normalizePrintRequest(body = {}) {
  const { image_url, copies = 1, paper_size = '4R', orientation = 'portrait', idempotency_key } = body;

  if (!validImageReference(image_url)) {
    throw new PrintValidationError('image_url must be a valid HTTP(S) URL or upload path.');
  }

  const numericCopies = typeof copies === 'string' && /^\d+$/.test(copies) ? Number(copies) : copies;
  if (!Number.isInteger(numericCopies) || numericCopies < 1 || numericCopies > 3) {
    throw new PrintValidationError('copies must be an integer between 1 and 3.');
  }

  if (typeof paper_size !== 'string' || paper_size.length < 1 || paper_size.length > 50) {
    throw new PrintValidationError('paper_size must be a non-empty string.');
  }

  if (orientation !== 'portrait' && orientation !== 'landscape') {
    throw new PrintValidationError('orientation must be portrait or landscape.');
  }

  if (idempotency_key !== undefined && idempotency_key !== null &&
      (typeof idempotency_key !== 'string' || idempotency_key.length < 1 || idempotency_key.length > 255)) {
    throw new PrintValidationError('idempotency_key must be a non-empty string of at most 255 characters.');
  }

  return {
    image_url,
    copies: numericCopies,
    paper_size,
    orientation,
    idempotency_key: idempotency_key || null,
  };
}

module.exports = { PrintValidationError, validImageReference, normalizePrintRequest };
