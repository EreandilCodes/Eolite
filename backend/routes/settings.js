import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';
import emailService from '../services/email.service.js';

const router = express.Router();

// Keys that can be changed via the admin UI
const ALLOWED_KEYS = ['notification_email'];

// ============================================================
// GET /api/settings – return all settings as { key: value, ... }
// Also includes read-only runtime info prefixed with _
// ============================================================
router.get('/', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });

    // Append read-only runtime info (from .env, not stored in DB)
    settings._email_mode = process.env.EMAIL_MODE || 'mock';
    settings._email_from = process.env.EMAIL_FROM || 'noreply@eolite.cz';

    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// POST /api/settings/test-email – send test notification
// Must be declared BEFORE /:key to avoid route conflict
// ============================================================
router.post('/test-email', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const row = await db.prepare(`SELECT value FROM settings WHERE key = 'notification_email'`).get();
    const toEmail = row?.value?.trim();

    if (!toEmail) {
      return res.status(400).json({ error: 'Notifikační email není nastaven. Nejdříve uložte emailovou adresu.' });
    }

    await emailService.sendTestNotification(toEmail);
    res.json({ message: `Testovací email odeslán na ${toEmail}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// PUT /api/settings/:key – update one setting
// ============================================================
router.put('/:key', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({ error: `Neznámé nastavení: ${key}` });
    }

    await db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(key, value ?? '');

    res.json({ message: 'Nastavení uloženo' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
