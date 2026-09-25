const multer = require('multer');
const path = require('path');
const fs = require('fs');

const assetDir = path.join(__dirname, '../uploads/assets');
fs.mkdirSync(assetDir, { recursive: true });

// Izin folder, dicoba setiap kali modul dimuat.
//
// Kejadian nyata: POST /api/v1/admin/assets menjawab 500 dengan
//   EACCES: permission denied, open '.../uploads/assets/<file>.png'
// karena folder ini milik uid 1000 (izin 775), sedangkan proses backend berjalan
// sebagai uid lain. Seluruh unggahan aset gagal; di browser hanya terlihat
// "Failed to load resource: 500", dan gambar tidak bisa ditambahkan di canvas.
//
// BATAS yang perlu diketahui: chmod hanya berhasil kalau proses ini PEMILIK
// folder (atau root). Di produksi proses backend bukan pemiliknya, jadi baris ini
// TIDAK memperbaiki apa pun yang sudah salah — ia hanya menjaga folder baru yang
// dibuat proses ini sendiri agar tetap bisa ditulis uid mana pun.
// Perbaikan sebenarnya harus dilakukan di disk: `chmod 1777 uploads uploads/assets`
// sebagai pemilik folder. Karena `uploads/*` ada di .gitignore, isinya tidak
// tersentuh deploy — tetapi izin folder bisa ikut berubah saat deploy ulang.
//
// Bit sticky 1777, bukan 777: semua uid boleh menulis, tetapi hanya pemilik
// berkas yang boleh menghapus milik orang lain.
try {
  fs.chmodSync(assetDir, 0o1777);
} catch (err) {
  // Jangan gagalkan start karenanya; izin mungkin sudah benar.
  console.warn(`[uploads] tidak bisa mengubah izin ${assetDir}: ${err.message}`);
}

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
    const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = new Set(['.png', '.jpg', '.jpeg', '.webp']);
    const isValid = allowed.has(file.mimetype) || allowedExts.has(ext);
    cb(isValid ? null : new Error('Only PNG, JPG, JPEG, or WebP images are allowed'), isValid);
  },
});
