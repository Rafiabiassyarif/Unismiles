const path = require('path');
const dotenv = require('dotenv');
// KroomBox runs this app from the monorepo root while server.js lives in
// unismiles-backend/. Load the site-level .env explicitly before importing
// clients that read PAYMENT_VISION_SERVICE_URL at module initialization.
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '.env'), override: false });

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }
  if (!process.env.PUBLIC_BASE_URL || !/^https:\/\//i.test(process.env.PUBLIC_BASE_URL)) {
    throw new Error('PUBLIC_BASE_URL must be an HTTPS URL in production.');
  }
  if (!process.env.CORS_ORIGINS || process.env.CORS_ORIGINS.includes('*')) {
    throw new Error('CORS_ORIGINS must explicitly list trusted HTTPS origins in production.');
  }
}

const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const express = require('express');
const http = require('http');
const cors = require('cors');
const { initSocketServer } = require('./utils/socketServer');
const { corsOrigin, requestId, createRateLimiter } = require('./utils/security');
const cleanupService = require('./services/cleanupService');

// Start background cron jobs
cleanupService.start();

const publicRoutes = require('./routes/v1/publicRoutes');
const kioskRoutes = require('./routes/v1/kioskRoutes');
const adminRoutes = require('./routes/v1/adminRoutes');
const assetRoutes = require('./routes/v1/assetRoutes');
const authRoutes = require('./routes/v1/authRoutes');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with namespaces (/kiosk & /admin)
initSocketServer(server);

app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
// WAJIB sebelum limiter: aplikasi berjalan di belakang proxy web server.
// Tanpa ini, req.ip berisi alamat proxy untuk SEMUA pengunjung, sehingga satu
// bucket rate limit dipakai bersama. Akibatnya 20 kali salah password dari satu
// orang mengunci halaman login untuk semua orang selama 15 menit, dan aplikasi
// melaporkannya sebagai "Network Error" karena 429 yang terpotong.
app.set('trust proxy', 1);
app.use(requestId);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));
app.use('/uploads', express.static('uploads', {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));
app.use('/assets', express.static('uploads/assets', {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

const downloadController = require('./controllers/downloadController');
app.get('/download/:session_code', createRateLimiter({ windowMs: 60_000, max: 20, keyGenerator: req => `download:${req.ip}` }), downloadController.serveDownloadPage);

app.get('/', (req, res) => {
  res.json({ status: 'success', message: 'Uni-Smiles API & WebSocket Server is running' });
});

const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });
app.use('/api/', apiLimiter);

app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/kiosk', kioskRoutes);
app.use('/api/v1/admin', adminRoutes);
// Kept as a separate router so asset uploads have stricter PNG validation.
app.use('/api/v1/admin/assets', assetRoutes);
app.get('/api/kiosk-status', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      maintenanceMode: false,
      brightness: 80,
      volume: 100,
      resolution: '1080x1920',
      paperSize: '4R'
    }
  });
});

app.use('/api/v1/auth', authRoutes);

// Error handling - must be registered AFTER all routes
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 8000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Uni-Smiles REST API & WebSocket Server is running on port ${PORT}`);
});
