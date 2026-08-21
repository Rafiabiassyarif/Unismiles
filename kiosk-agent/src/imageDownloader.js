const fsp = require('fs').promises;
const os = require('os');
const path = require('path');

const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const SIGNATURES = {
  'image/png': (buffer) => buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  'image/jpeg': (buffer) => buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  'image/webp': (buffer) => buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP',
};

function imageUrlError(message) {
  const error = new Error(message);
  error.code = 'IMAGE_DOWNLOAD_FAILED';
  return error;
}

function rejectPathTraversal(rawReference) {
  const rawPath = String(rawReference).split(/[?#]/, 1)[0];
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw imageUrlError('image_url contains an invalid encoded path');
  }
  if (/(^|[\\/])\.\.(?:[\\/]|$)/.test(decodedPath)) {
    throw imageUrlError('image_url path traversal is not allowed');
  }
}

function validateImageUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) throw imageUrlError('image_url must be a valid http/https URL');
  rejectPathTraversal(value.replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i, ''));

  let url;
  try {
    url = new URL(value);
  } catch {
    throw imageUrlError('image_url must be a valid http/https URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) throw imageUrlError('image_url must use http or https');
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw imageUrlError('image_url contains an invalid encoded path');
  }
  const pathSegments = decodedPath.split(/[\\/]/);
  if (pathSegments.includes('..') || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(url.pathname)) {
    throw imageUrlError('image_url path traversal is not allowed');
  }
  return url;
}

async function downloadImage(imageUrl, { maxBytes = 15 * 1024 * 1024, timeoutMs = 60000, fetchImpl = global.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available in this Node.js runtime');

  let url = validateImageUrl(imageUrl);
  let response;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetchImpl(url, { redirect: 'manual', signal: controller.signal });
    } catch (error) {
      const wrapped = new Error(error.name === 'AbortError' ? 'Image download timed out' : error.message);
      wrapped.code = 'IMAGE_DOWNLOAD_FAILED';
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect === 3 || !response.headers.get('location')) {
        const error = new Error('Too many image redirects');
        error.code = 'IMAGE_DOWNLOAD_FAILED';
        throw error;
      }
      const location = response.headers.get('location');
      rejectPathTraversal(location);
      url = validateImageUrl(new URL(location, url).toString());
      continue;
    }
    break;
  }

  if (!response || !response.ok) {
    const error = new Error(`Image download returned HTTP ${response ? response.status : 'unknown'}`);
    error.code = 'IMAGE_DOWNLOAD_FAILED';
    throw error;
  }

  const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    const error = new Error(`Unsupported image MIME type: ${mimeType || 'missing'}`);
    error.code = 'IMAGE_INVALID';
    throw error;
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    const error = new Error('Image exceeds the maximum allowed size');
    error.code = 'IMAGE_TOO_LARGE';
    throw error;
  }

  const chunks = [];
  let total = 0;
  if (!response.body) {
    const error = new Error('Image response has no body');
    error.code = 'IMAGE_DOWNLOAD_FAILED';
    throw error;
  }
  const reader = response.body.getReader();
  let bodyTimedOut = false;
  const bodyTimer = setTimeout(() => {
    bodyTimedOut = true;
    reader.cancel().catch(() => {});
  }, timeoutMs);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        const error = new Error('Image exceeds the maximum allowed size');
        error.code = 'IMAGE_TOO_LARGE';
        throw error;
      }
      chunks.push(Buffer.from(value));
    }
    if (bodyTimedOut) {
      const error = new Error('Image download timed out');
      error.code = 'IMAGE_DOWNLOAD_FAILED';
      throw error;
    }
  } catch (error) {
    if (error.code) throw error;
    const wrapped = new Error(error.message || 'Image download failed');
    wrapped.code = 'IMAGE_DOWNLOAD_FAILED';
    throw wrapped;
  } finally {
    clearTimeout(bodyTimer);
    reader.releaseLock();
  }

  const buffer = Buffer.concat(chunks);
  if (!buffer.length || !SIGNATURES[mimeType](buffer)) {
    const error = new Error('Downloaded file is not a valid supported image');
    error.code = 'IMAGE_INVALID';
    throw error;
  }

  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'uni-smiles-print-'));
  const extension = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
  const filePath = path.join(directory, `photo${extension}`);
  await fsp.writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });
  return { filePath, directory, mimeType, size: buffer.length };
}

async function cleanupDownloadedImage(download) {
  if (!download || !download.directory) return;
  await fsp.rm(download.directory, { recursive: true, force: true });
}

module.exports = { downloadImage, cleanupDownloadedImage, validateImageUrl, SUPPORTED_MIME_TYPES };
