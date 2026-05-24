import express from 'express';
import db from '../database.js';
import { logger } from '../logger.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

function generateSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// GET /api/magazine – published posts (PUBLIC)
router.get('/', async (req, res) => {
  try {
    const posts = await db.prepare(`
      SELECT id, title_cz, title_en, slug, excerpt_cz, excerpt_en, cover_image, published_at, created_at
      FROM magazine_posts
      WHERE is_published = 1
      ORDER BY published_at DESC, created_at DESC
    `).all();
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/magazine/admin/all – all posts (ADMIN)
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const posts = await db.prepare(`
      SELECT * FROM magazine_posts ORDER BY created_at DESC
    `).all();
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/magazine/:slug – single post by slug (PUBLIC)
router.get('/:slug', async (req, res) => {
  try {
    const post = await db.prepare(`
      SELECT * FROM magazine_posts WHERE slug = ? AND is_published = 1
    `).get(req.params.slug);
    if (!post) return res.status(404).json({ error: 'Článek nenalezen' });
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/magazine – create post (ADMIN)
router.post('/', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { title_cz, title_en, content_cz, content_en, excerpt_cz, excerpt_en, cover_image, is_published } = req.body;

    if (!title_cz) return res.status(400).json({ error: 'Název (CZ) je povinný' });

    const slug = generateSlug(title_cz);
    const published_at = is_published ? new Date().toISOString() : null;

    const result = await db.prepare(`
      INSERT INTO magazine_posts
        (title_cz, title_en, slug, content_cz, content_en, excerpt_cz, excerpt_en, cover_image, is_published, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title_cz,
      title_en || null,
      slug,
      content_cz || null,
      content_en || null,
      excerpt_cz || null,
      excerpt_en || null,
      cover_image || null,
      is_published ? 1 : 0,
      published_at
    );

    const post = await db.prepare('SELECT * FROM magazine_posts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Článek vytvořen', post });
  } catch (error) {
    logger.fromError('create_post_failed', error);
    res.status(error.message.includes('UNIQUE') ? 400 : 500).json({ error: error.message });
  }
});

// PUT /api/magazine/:id – update post (ADMIN)
router.put('/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { title_cz, title_en, content_cz, content_en, excerpt_cz, excerpt_en, cover_image, is_published } = req.body;

    if (!title_cz) return res.status(400).json({ error: 'Název (CZ) je povinný' });

    const slug = generateSlug(title_cz);
    const published_at = is_published ? new Date().toISOString() : null;

    await db.prepare(`
      UPDATE magazine_posts
      SET title_cz = ?, title_en = ?, slug = ?, content_cz = ?, content_en = ?,
          excerpt_cz = ?, excerpt_en = ?, cover_image = ?, is_published = ?, published_at = ?
      WHERE id = ?
    `).run(
      title_cz,
      title_en || null,
      slug,
      content_cz || null,
      content_en || null,
      excerpt_cz || null,
      excerpt_en || null,
      cover_image || null,
      is_published ? 1 : 0,
      published_at,
      req.params.id
    );

    const post = await db.prepare('SELECT * FROM magazine_posts WHERE id = ?').get(req.params.id);
    res.json({ message: 'Článek aktualizován', post });
  } catch (error) {
    logger.fromError('update_post_failed', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/magazine/:id – delete post (ADMIN)
router.delete('/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    await db.prepare('DELETE FROM magazine_posts WHERE id = ?').run(req.params.id);
    res.json({ message: 'Článek smazán' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
