const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Folder ditulis dari lokasi berkas, bukan CWD. Lihat catatan di bawah.
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
// Izin folder, dicoba setiap kali modul dimuat.
//
// Kenapa: proses backend TIDAK selalu berjalan sebagai pemilik folder. Kejadian
// nyata — POST /api/v1/admin/assets menjawab 500 dengan
//   EACCES: permission denied, open '.../uploads/assets/<file>.png'
// karena foldernya milik uid 1000 dengan izin 775, sedangkan backend jalan
// sebagai uid lain. Akibatnya SEMUA unggahan gagal.
//
// BATAS: chmod hanya berhasil kalau proses ini pemilik folder (atau root). Di
// produksi bukan, jadi baris ini TIDAK memperbaiki folder yang sudah salah —
// perbaikan sebenarnya harus dilakukan di disk sebagai pemilik folder.
//
// Bit sticky 1777, bukan 777: semua uid boleh menulis, tetapi hanya pemilik
// berkas yang boleh menghapus milik orang lain. Gagal chmod tidak fatal — jangan
// sampai backend tidak bisa start hanya karena izin.
try {
  fs.chmodSync(uploadDir, 0o1777);
} catch (err) {
  console.warn(`[uploads] tidak bisa mengubah izin ${uploadDir}: ${err.message}`);
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Path ABSOLUT, bukan relatif.
    //
    // `cb(null, 'uploads/')` diselesaikan terhadap CWD proses. Backend dijalankan
    // dari root monorepo, jadi berkas tertulis ke <root>/uploads — bukan
    // <root>/unismiles-backend/uploads tempat berkas statis disajikan. Akibatnya
    // upload berhasil tetapi gambarnya 404.
    cb(null, uploadDir);
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
