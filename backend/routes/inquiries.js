import express from 'express';
import db from '../database.js';
import { logger } from '../logger.js';
import { AuthMiddleware } from '../middleware/auth.js';
import emailService from '../services/email.service.js';

const router = express.Router();

// ============================================================
// Anti-bot: per-IP rate limiting (5 requests / 5 minutes)
// In-memory Map – resets on server restart (sufficient for this use case)
// ============================================================
const rateLimits = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip);

  if (!entry) {
    rateLimits.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false };
  }

  entry.count++;
  return { allowed: true };
}

// Cleanup old rate limit entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimits.delete(ip);
    }
  }
}, 10 * 60 * 1000);

// ============================================================
// POST /api/inquiries – submit inquiry (PUBLIC)
// Anti-bot: honeypot + time check + rate limit
// ============================================================
router.post('/', async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '0.0.0.0';

    // Rate limit check
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: 'Příliš mnoho požadavků. Zkuste to za chvíli.' });
    }

    const { name, email, phone, message, website, form_loaded_at } = req.body;

    // Honeypot check: "website" field must be empty
    if (website && website.trim() !== '') {
      // Silently reject bots – return 200 so bot thinks it succeeded
      return res.status(200).json({ message: 'Poptávka odeslána' });
    }

    // Time check: form must not be submitted in under 2 seconds
    if (form_loaded_at) {
      const elapsed = Date.now() - Number(form_loaded_at);
      if (elapsed < 2000) {
        return res.status(400).json({ error: 'Formulář byl odeslán příliš rychle. Zkuste znovu.' });
      }
    }

    // Basic validation
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Jméno je povinné' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Platný email je povinný' });
    }
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Zpráva je povinná' });
    }

    // Save to DB
    const result = await db.prepare(`
      INSERT INTO inquiries (name, email, phone, message)
      VALUES (?, ?, ?, ?)
    `).run(
      name.trim(),
      email.trim(),
      phone ? phone.trim() : null,
      message.trim()
    );

    const inquiry = await db.prepare('SELECT * FROM inquiries WHERE id = ?').get(result.lastInsertRowid);

    // Non-critical email notification – recipient from DB settings
    try {
      const setting = await db.prepare(`SELECT value FROM settings WHERE key = 'notification_email'`).get();
      const notificationEmail = setting?.value?.trim() || null;
      await emailService.sendInquiryNotification(inquiry, notificationEmail);
    } catch (emailError) {
      logger.fromError('email_notification_failed', emailError, { type: 'non_critical' });
    }

    res.status(201).json({ message: 'Poptávka odeslána. Brzy vás kontaktujeme.' });
  } catch (error) {
    logger.fromError('save_inquiry_failed', error);
    res.status(500).json({ error: 'Chyba serveru. Zkuste to prosím znovu.' });
  }
});

// GET /api/inquiries/admin/all – list all inquiries (ADMIN)
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const inquiries = await db.prepare(`
      SELECT * FROM inquiries ORDER BY created_at DESC
    `).all();
    res.json(inquiries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/inquiries/:id/read – mark as read (ADMIN)
router.put('/:id/read', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    await db.prepare('UPDATE inquiries SET is_read = 1 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Označeno jako přečteno' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/inquiries/:id – delete inquiry (ADMIN)
router.delete('/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    await db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
    res.json({ message: 'Poptávka smazána' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
