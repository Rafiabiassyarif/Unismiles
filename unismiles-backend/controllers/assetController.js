const fs = require('fs/promises');
const pool = require('../config/db');

const ALLOWED_TYPES = new Set(['overlay', 'logo', 'sticker']);
const MAX_DIMENSION = 8000;

/**
 * Baca ukuran gambar dari ISI berkasnya, bukan dari nama atau tipe yang diklaim.
 *
 * KENAPA INI DIPERBAIKI
 *
 * Dulu fungsi ini HANYA bisa membaca PNG, tetapi middleware-nya menerima
 * PNG/JPG/JPEG/WebP. Akibatnya foto JPG yang sah ditolak dengan pesan
 * "Uploaded file is not a valid PNG image" — dan itulah yang membuat unggah
 * gambar di editor canvas gagal, karena foto dari kamera/HP hampir selalu JPG.
 *
 * Tipe juga tidak lagi ditulis 'image/png' secara tetap: mime asli berkasnya
 * yang dipakai, supaya berkas JPG tidak tercatat sebagai PNG di database.
 */

/** Jenis berkas dari magic bytes-nya. null kalau tidak dikenali. */
function jenisBerkas(b) {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function ukuranPng(b) {
  if (b.length < 24 || b.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Uploaded file is not a valid PNG image');
  }
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/**
 * Ukuran JPEG: telusuri penanda segmen sampai menemukan SOFn.
 *
 * Tidak ada header panjang-tetap seperti PNG, jadi memang harus ditelusuri.
 * Penanda 0xC0-0xCF memuat ukuran, kecuali C4 (tabel Huffman), C8 (JPG) dan
 * CC (tabel aritmetik) yang bukan penanda frame.
 */
function ukuranJpeg(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const penanda = b[i + 1];
    if (penanda === 0xd8 || (penanda >= 0xd0 && penanda <= 0xd9)) { i += 2; continue; }
    const panjang = b.readUInt16BE(i + 2);
    const isFrame = penanda >= 0xc0 && penanda <= 0xcf
      && penanda !== 0xc4 && penanda !== 0xc8 && penanda !== 0xcc;
    if (isFrame) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    if (panjang < 2) break;
    i += 2 + panjang;
  }
  throw new Error('Uploaded file is not a valid JPEG image');
}

function ukuranWebp(b) {
  const format = b.toString('ascii', 12, 16);
  if (format === 'VP8X' && b.length >= 30) {
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  if (format === 'VP8 ' && b.length >= 30) {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (format === 'VP8L' && b.length >= 25) {
    const bita = b.readUInt32LE(21);
    return { width: 1 + (bita & 0x3fff), height: 1 + ((bita >> 14) & 0x3fff) };
  }
  throw new Error('Uploaded file is not a valid WebP image');
}

/** Ukuran gambar dari isinya; melempar kalau formatnya tidak didukung. */
async function bacaUkuranGambar(filePath) {
  const buffer = await fs.readFile(filePath);
  const jenis = jenisBerkas(buffer);
  if (jenis === 'png') return { ...ukuranPng(buffer), mime: 'image/png', ext: 'png' };
  if (jenis === 'jpeg') return { ...ukuranJpeg(buffer), mime: 'image/jpeg', ext: 'jpg' };
  if (jenis === 'webp') return { ...ukuranWebp(buffer), mime: 'image/webp', ext: 'webp' };
  throw new Error('Uploaded file is not a valid PNG, JPG, JPEG, or WebP image');
}

function assetResponse(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.asset_type,
    url: row.file_url,
    mime_type: row.mime_type,
    file_size: row.file_size,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
  };
}

const getAssets = async (req, res) => {
  const type = req.query.type || null;
  if (type && !ALLOWED_TYPES.has(type)) {
    return res.status(400).json({ success: false, message: 'Invalid asset type' });
  }

  const params = [req.user.id];
  let query = `SELECT id, name, asset_type, file_url, mime_type, file_size, is_active, created_at
               FROM admin_assets WHERE admin_id = ? AND is_active = 1`;
  if (type) { query += ' AND asset_type = ?'; params.push(type); }
  query += ' ORDER BY created_at DESC';

  try {
    const [rows] = await pool.query(query, params);
    return res.json({ success: true, data: rows.map(assetResponse) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const uploadAsset = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No image asset uploaded' });

  try {
    const { name, type = 'overlay' } = req.body;
    if (!name || !String(name).trim()) throw new Error('name is required');
    if (!ALLOWED_TYPES.has(type)) throw new Error('Invalid asset type');

    // Ukuran DAN mime diambil dari isi berkasnya — satu pembacaan, satu sumber
    // kebenaran. Mime dari klien bisa salah atau kosong.
    const { width, height, mime } = await bacaUkuranGambar(req.file.path);
    if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) {
      throw new Error(`Image dimensions must be between 1 and ${MAX_DIMENSION}px`);
    }

    const [result] = await pool.query(
      `INSERT INTO admin_assets (admin_id, name, asset_type, file_url, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, String(name).trim().slice(0, 160), type, `/uploads/assets/${req.file.filename}`, mime, req.file.size]
    );
    const [rows] = await pool.query('SELECT id, name, asset_type, file_url, mime_type, file_size, is_active, created_at FROM admin_assets WHERE id = ?', [result.insertId]);
    return res.status(201).json({ success: true, data: assetResponse(rows[0]) });
  } catch (error) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ success: false, message: error.message });
  }
};

const deleteAsset = async (req, res) => {
  try {
    const [result] = await pool.query(
      'UPDATE admin_assets SET is_active = 0 WHERE id = ? AND admin_id = ? AND is_active = 1',
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Asset not found or not authorized' });
    return res.json({ success: true, message: 'Asset deleted' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getAssets, uploadAsset, deleteAsset };
