const fs = require('fs/promises');

const SIGNATURES = {
  png: buffer => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  jpeg: buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  webp: buffer => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
};

async function assertImageFile(file, { allowed = ['png', 'jpeg', 'webp'], maxBytes = 15 * 1024 * 1024 } = {}) {
  if (!file || !file.path) throw new Error('Image file is required');
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxBytes) {
    throw new Error(`Image must be between 1 byte and ${maxBytes} bytes`);
  }

  const header = await fs.readFile(file.path, { encoding: null, flag: 'r' });
  const type = allowed.find(candidate => SIGNATURES[candidate]?.(header));
  if (!type) throw new Error('Uploaded file is not a supported image');
  return type;
}

module.exports = { assertImageFile };
