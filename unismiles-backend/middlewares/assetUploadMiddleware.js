const multer = require('multer');
const path = require('path');
const fs = require('fs');

const assetDir = path.join(__dirname, '../uploads/assets');
fs.mkdirSync(assetDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, assetDir),
  filename: (_req, file, cb) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${suffix}${path.extname(file.originalname).toLowerCase()}`);
  },
});

module.exports = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPng = file.mimetype === 'image/png' || path.extname(file.originalname).toLowerCase() === '.png';
    cb(isPng ? null : new Error('Only PNG assets are allowed'), isPng);
  },
});
