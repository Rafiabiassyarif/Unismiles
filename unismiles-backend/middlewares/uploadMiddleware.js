const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists at project root
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // Generate a unique filename using Date and a random number to prevent overwriting
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1,
    fields: 40,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMime = new Set(['image/png', 'image/jpeg', 'image/webp']);
    cb(allowedMime.has(file.mimetype) ? null : new Error('Only PNG, JPEG, or WebP images are allowed'), allowedMime.has(file.mimetype));
  },
});

module.exports = upload;
