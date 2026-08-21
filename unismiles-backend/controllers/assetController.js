const fs = require('fs/promises');
const pool = require('../config/db');

const ALLOWED_TYPES = new Set(['overlay', 'logo', 'sticker']);
const MAX_DIMENSION = 8000;

function parsePngDimensions(filePath) {
  return fs.readFile(filePath).then(buffer => {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error('Uploaded file is not a valid PNG image');
    }
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  });
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
  if (!req.file) return res.status(400).json({ success: false, message: 'No PNG asset uploaded' });

  try {
    const { name, type = 'overlay' } = req.body;
    if (!name || !String(name).trim()) throw new Error('name is required');
    if (!ALLOWED_TYPES.has(type)) throw new Error('Invalid asset type');

    const { width, height } = await parsePngDimensions(req.file.path);
    if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) {
      throw new Error(`PNG dimensions must be between 1 and ${MAX_DIMENSION}px`);
    }

    const [result] = await pool.query(
      `INSERT INTO admin_assets (admin_id, name, asset_type, file_url, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, String(name).trim().slice(0, 160), type, `/uploads/assets/${req.file.filename}`, 'image/png', req.file.size]
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
