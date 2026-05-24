import express from 'express';
import db from '../database.js';
import { logger } from '../logger.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Helper: generate slug from text
function generateSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')    // remove diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============================================================
// REFERENCE CATEGORIES
// ============================================================

// GET /api/references/categories – all active categories (PUBLIC)
router.get('/categories', async (req, res) => {
  try {
    const categories = await db.prepare(`
      SELECT * FROM reference_categories
      WHERE is_active = 1
      ORDER BY display_order ASC, created_at ASC
    `).all();
    res.json(categories);
  } catch (error) {
    logger.fromError('load_categories_failed', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/references/categories/admin/all – all categories (ADMIN)
router.get('/categories/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const categories = await db.prepare(`
      SELECT * FROM reference_categories ORDER BY display_order ASC, created_at ASC
    `).all();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/references/categories/:slug – category by slug (PUBLIC)
router.get('/categories/:slug', async (req, res) => {
  try {
    const category = await db.prepare(`
      SELECT * FROM reference_categories WHERE slug = ? AND is_active = 1
    `).get(req.params.slug);
    if (!category) return res.status(404).json({ error: 'Kategorie nenalezena' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/references/categories – create category (ADMIN)
router.post('/categories', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { name_cz, name_en, slug, tag, is_active } = req.body;

    if (!name_cz) return res.status(400).json({ error: 'Název (CZ) je povinný' });

    const finalSlug = slug ? slug : generateSlug(name_cz);
    const activeVal = is_active ? 1 : 0;

    const maxOrder = await db.prepare('SELECT MAX(display_order) as max FROM reference_categories').get();
    const display_order = (maxOrder?.max || 0) + 1;

    const result = await db.prepare(`
      INSERT INTO reference_categories (name_cz, name_en, slug, tag, display_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name_cz, name_en || null, finalSlug, tag || null, display_order, activeVal);

    const category = await db.prepare('SELECT * FROM reference_categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Kategorie vytvořena', category });
  } catch (error) {
    logger.fromError('create_category_failed', error);
    res.status(error.message.includes('UNIQUE') ? 400 : 500).json({ error: error.message });
  }
});

// PUT /api/references/categories/:id – update category (ADMIN)
router.put('/categories/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { name_cz, name_en, slug, tag, is_active } = req.body;

    if (!name_cz) return res.status(400).json({ error: 'Název (CZ) je povinný' });

    const finalSlug = slug ? slug : generateSlug(name_cz);
    const activeVal = is_active ? 1 : 0;

    await db.prepare(`
      UPDATE reference_categories
      SET name_cz = ?, name_en = ?, slug = ?, tag = ?, is_active = ?
      WHERE id = ?
    `).run(name_cz, name_en || null, finalSlug, tag || null, activeVal, req.params.id);

    const category = await db.prepare('SELECT * FROM reference_categories WHERE id = ?').get(req.params.id);
    res.json({ message: 'Kategorie aktualizována', category });
  } catch (error) {
    logger.fromError('update_category_failed', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/references/categories/:id – delete category (ADMIN)
router.delete('/categories/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    await db.prepare('DELETE FROM reference_categories WHERE id = ?').run(req.params.id);
    res.json({ message: 'Kategorie smazána' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/references/categories/:id/reorder – reorder (ADMIN)
router.put('/categories/:id/reorder', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { direction } = req.body;
    if (!['up', 'down'].includes(direction)) {
      return res.status(400).json({ error: 'Neplatný směr' });
    }

    const current = await db.prepare('SELECT * FROM reference_categories WHERE id = ?').get(req.params.id);
    if (!current) return res.status(404).json({ error: 'Kategorie nenalezena' });

    const op = direction === 'up' ? '<' : '>';
    const ord = direction === 'up' ? 'DESC' : 'ASC';

    const adjacent = await db.prepare(`
      SELECT * FROM reference_categories
      WHERE display_order ${op} ?
      ORDER BY display_order ${ord} LIMIT 1
    `).get(current.display_order);

    if (!adjacent) return res.json({ message: 'Již na hranici', category: current });

    await db.prepare('UPDATE reference_categories SET display_order = ? WHERE id = ?').run(adjacent.display_order, current.id);
    await db.prepare('UPDATE reference_categories SET display_order = ? WHERE id = ?').run(current.display_order, adjacent.id);

    res.json({ message: 'Pořadí aktualizováno' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// REFERENCES (project_references)
// ============================================================

// GET /api/references – all active references (PUBLIC)
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let query = `
      SELECT r.*, rc.name_cz as category_name_cz, rc.name_en as category_name_en, rc.slug as category_slug
      FROM project_references r
      JOIN reference_categories rc ON r.category_id = rc.id
      WHERE r.is_active = 1
    `;
    const params = [];
    if (category) {
      query += ' AND rc.slug = ?';
      params.push(category);
    }
    query += ' ORDER BY r.is_featured DESC, r.created_at DESC';

    const refs = await db.prepare(query).all(...params);
    res.json(refs);
  } catch (error) {
    logger.fromError('load_references_failed', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/references/admin/all – all references (ADMIN)
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const refs = await db.prepare(`
      SELECT r.*, rc.name_cz as category_name_cz
      FROM project_references r
      LEFT JOIN reference_categories rc ON r.category_id = rc.id
      ORDER BY r.created_at DESC
    `).all();
    res.json(refs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/references/:id – single reference (PUBLIC)
router.get('/:id', async (req, res) => {
  try {
    const ref = await db.prepare(`
      SELECT r.*, rc.name_cz as category_name_cz, rc.name_en as category_name_en, rc.slug as category_slug
      FROM project_references r
      JOIN reference_categories rc ON r.category_id = rc.id
      WHERE r.id = ? AND r.is_active = 1
    `).get(req.params.id);
    if (!ref) return res.status(404).json({ error: 'Reference nenalezena' });
    res.json(ref);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/references – create reference (ADMIN)
router.post('/', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { category_id, title_cz, title_en, description_cz, description_en, cover_image, gallery_json, is_featured, is_active } = req.body;

    if (!title_cz) return res.status(400).json({ error: 'Název (CZ) je povinný' });
    if (!category_id) return res.status(400).json({ error: 'Kategorie je povinná' });

    // Validate gallery_json if provided
    if (gallery_json) {
      try { JSON.parse(gallery_json); } catch { return res.status(400).json({ error: 'gallery_json musí být platné JSON pole' }); }
    }

    const result = await db.prepare(`
      INSERT INTO project_references
        (category_id, title_cz, title_en, description_cz, description_en, cover_image, gallery_json, is_featured, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      category_id,
      title_cz,
      title_en || null,
      description_cz || null,
      description_en || null,
      cover_image || null,
      gallery_json || null,
      is_featured ? 1 : 0,
      is_active !== undefined ? (is_active ? 1 : 0) : 1
    );

    const ref = await db.prepare('SELECT * FROM project_references WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Reference vytvořena', reference: ref });
  } catch (error) {
    logger.fromError('create_reference_failed', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/references/:id – update reference (ADMIN)
router.put('/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { category_id, title_cz, title_en, description_cz, description_en, cover_image, gallery_json, is_featured, is_active } = req.body;

    if (!title_cz) return res.status(400).json({ error: 'Název (CZ) je povinný' });
    if (!category_id) return res.status(400).json({ error: 'Kategorie je povinná' });

    if (gallery_json) {
      try { JSON.parse(gallery_json); } catch { return res.status(400).json({ error: 'gallery_json musí být platné JSON pole' }); }
    }

    await db.prepare(`
      UPDATE project_references
      SET category_id = ?, title_cz = ?, title_en = ?, description_cz = ?, description_en = ?,
          cover_image = ?, gallery_json = ?, is_featured = ?, is_active = ?
      WHERE id = ?
    `).run(
      category_id,
      title_cz,
      title_en || null,
      description_cz || null,
      description_en || null,
      cover_image || null,
      gallery_json || null,
      is_featured ? 1 : 0,
      is_active ? 1 : 0,
      req.params.id
    );

    const ref = await db.prepare('SELECT * FROM project_references WHERE id = ?').get(req.params.id);
    res.json({ message: 'Reference aktualizována', reference: ref });
  } catch (error) {
    logger.fromError('update_reference_failed', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/references/:id – delete reference (ADMIN)
router.delete('/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    await db.prepare('DELETE FROM project_references WHERE id = ?').run(req.params.id);
    res.json({ message: 'Reference smazána' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
