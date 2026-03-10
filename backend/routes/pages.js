import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/pages – all active sections (PUBLIC)
router.get('/', async (req, res) => {
  try {
    const sections = await db.prepare(`
      SELECT * FROM page_content WHERE is_active = 1
    `).all();
    res.json(sections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/pages/admin/all – all sections (ADMIN)
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const sections = await db.prepare('SELECT * FROM page_content ORDER BY id ASC').all();
    res.json(sections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/pages/:key – single section (PUBLIC)
router.get('/:key', async (req, res) => {
  try {
    const section = await db.prepare(`
      SELECT * FROM page_content WHERE section_key = ? AND is_active = 1
    `).get(req.params.key);
    if (!section) return res.status(404).json({ error: 'Sekce nenalezena' });
    res.json(section);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/pages/:key – update section (ADMIN)
router.put('/:key', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { content_cz, content_en, image_url, is_active, section_title } = req.body;

    const existing = await db.prepare('SELECT * FROM page_content WHERE section_key = ?').get(req.params.key);

    if (!existing) {
      // Create if not exists
      await db.prepare(`
        INSERT INTO page_content (section_key, section_title, content_cz, content_en, image_url, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(req.params.key, section_title || req.params.key, content_cz || '', content_en || '', image_url || null, is_active !== undefined ? (is_active ? 1 : 0) : 1);
    } else {
      await db.prepare(`
        UPDATE page_content
        SET content_cz = ?, content_en = ?, image_url = ?, is_active = ?
        WHERE section_key = ?
      `).run(
        content_cz !== undefined ? content_cz : existing.content_cz,
        content_en !== undefined ? content_en : existing.content_en,
        image_url !== undefined ? image_url : existing.image_url,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        req.params.key
      );
    }

    const section = await db.prepare('SELECT * FROM page_content WHERE section_key = ?').get(req.params.key);
    res.json({ message: 'Sekce aktualizována', section });
  } catch (error) {
    console.error('Error updating page section:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
