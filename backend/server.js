import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database.js';

import authRoutes from './routes/auth.js';
import referencesRoutes from './routes/references.js';
import magazineRoutes from './routes/magazine.js';
import inquiriesRoutes from './routes/inquiries.js';
import pagesRoutes from './routes/pages.js';
import galleryRoutes from './routes/gallery.js';
import uploadRoutes from './routes/upload.js';
import settingsRoutes from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

console.log('🔄 Starting Eolite server initialization...');

const initWithTimeout = Promise.race([
  initDatabase(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Database initialization timeout')), 35000)
  )
]);

initWithTimeout
  .catch(err => {
    console.warn('⚠️  Database initialization issue:', err.message);
    console.warn('⚠️  Server will start anyway.');
  })
  .finally(() => {
    // Warn if running with insecure JWT secret default
    if (!process.env.JWT_SECRET) {
      console.warn('⚠️  JWT_SECRET not set in .env – using insecure default. Set a strong secret before deploying to production!');
    }

    app.disable('x-powered-by'); // Don't advertise Express version

    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Security headers (applied to all responses)
    app.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      next();
    });

    // Static files
    app.use(express.static(path.join(__dirname, '../frontend')));

    // API Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/references', referencesRoutes);
    app.use('/api/magazine', magazineRoutes);
    app.use('/api/inquiries', inquiriesRoutes);
    app.use('/api/pages', pagesRoutes);
    app.use('/api/gallery',   galleryRoutes);
    app.use('/api/upload',    uploadRoutes);
    app.use('/api/settings',  settingsRoutes);

    // Admin panel
    app.get('/admin', (req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/admin.html'));
    });

    // Login page
    app.get('/login', (req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/login.html'));
    });

    // Public SPA – all remaining routes serve index.html
    // JS router handles /reference, /reference/:slug, /reference/:slug/:id, /magazine, /magazine/:slug
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/index.html'));
    });

    const server = app.listen(PORT, () => {
      console.log(`✅ Eolite Server running on http://localhost:${PORT}`);
      console.log(`📊 Admin Panel: http://localhost:${PORT}/admin`);
      console.log(`🔐 Login: http://localhost:${PORT}/login`);
      console.log(`🌐 Public: http://localhost:${PORT}/`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Set a different PORT env variable.`);
        process.exit(1);
      } else {
        throw err;
      }
    });
  });
