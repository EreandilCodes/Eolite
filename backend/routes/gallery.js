import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import sharp from 'sharp';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ============================================================
// Upload setup
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '../../frontend/uploads/gallery');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
// Whitelist extensions to prevent .html/.svg/etc. bypass even if MIME is spoofed
const ALLOWED_EXT  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// Use memory storage so sharp can process before writing to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB – allow large originals before resize
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`Nepodporovaný typ souboru: ${file.mimetype}`));
    }
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new Error(`Nepodporovaná přípona souboru: ${ext || '(žádná)'}`));
    }
    cb(null, true);
  }
});

/**
 * Resize and compress an image buffer.
 * Max 2000 px on longest side, quality 85 for JPEG/WebP, compression 8 for PNG.
 * GIFs are returned unchanged (animated GIF support is limited).
 */
async function resizeForWeb(buffer, mimetype) {
  if (mimetype === 'image/gif') return buffer;
  try {
    let s = sharp(buffer).resize(2000, 2000, { fit: 'inside', withoutEnlargement: true });
    if (mimetype === 'image/jpeg') s = s.jpeg({ quality: 85 });
    else if (mimetype === 'image/webp') s = s.webp({ quality: 85 });
    else if (mimetype === 'image/png') s = s.png({ compressionLevel: 8 });
    return await s.toBuffer();
  } catch (err) {
    console.error('Image resize failed, saving original:', err.message);
    return buffer;
  }
}

// Wrap multer so its errors return JSON 400 (not Express default HTML)
function handleMultipart(req, res, next) {
  upload.array('files', 100)(req, res, (err) => {
    if (!err) return next();
    res.status(400).json({ error: err.message });
  });
}

// ============================================================
// Helpers
// ============================================================

/** Sanitize a filename for disk storage (keep ext chars, replace rest with -) */
function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || 'image';
}

/** Generate identifier from original filename (no ext) */
function filenameToIdentifier(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 75) || 'image';
}

/** Find a unique identifier – appends -2, -3, … on collision */
async function uniqueIdentifier(base) {
  let identifier = base;
  let attempt = 1;
  while (true) {
    const row = await db.prepare('SELECT id FROM gallery_images WHERE identifier = ?').get(identifier);
    if (!row) return identifier;
    attempt++;
    identifier = `${base.substring(0, 73)}-${attempt}`;
  }
}

function generateSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

/** Validate identifier: lowercase, alphanumeric + dash + underscore, max 80 chars */
function validateIdentifier(id) {
  return /^[a-z0-9_-]{1,80}$/.test(id);
}

/** Convert SQLITE UNIQUE constraint error to user-friendly message */
function handleUniqueError(error, field = 'Hodnota') {
  if (error.message && error.message.includes('UNIQUE')) {
    return `${field} již existuje. Zvolte jiný.`;
  }
  return error.message;
}

// ============================================================
// FOLDERS
// ============================================================

// GET /api/gallery/folders – all folders (flat list, client builds tree)
router.get('/folders', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const folders = await db.prepare(`
      SELECT * FROM gallery_folders ORDER BY parent_id ASC, display_order ASC, name_cz ASC
    `).all();
    res.json(folders);
  } catch (error) {
    console.error('Error loading gallery folders:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/gallery/folders – create folder
router.post('/folders', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { name_cz, name_en, slug, parent_id, display_order } = req.body;

    if (!name_cz || !name_cz.trim()) {
      return res.status(400).json({ error: 'Název (CZ) je povinný' });
    }

    const finalSlug = slug ? slug.trim() : generateSlug(name_cz.trim());

    if (!finalSlug || !/^[a-z0-9_-]{1,80}$/.test(finalSlug)) {
      return res.status(400).json({ error: 'Slug musí obsahovat pouze malá písmena, číslice, - nebo _ (max 80 znaků)' });
    }

    // Validate parent_id if provided
    if (parent_id) {
      const parent = await db.prepare('SELECT id FROM gallery_folders WHERE id = ?').get(parent_id);
      if (!parent) return res.status(400).json({ error: 'Nadřazená složka neexistuje' });
    }

    const result = await db.prepare(`
      INSERT INTO gallery_folders (name_cz, name_en, slug, parent_id, display_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name_cz.trim(),
      name_en ? name_en.trim() : null,
      finalSlug,
      parent_id || null,
      display_order || 0
    );

    const folder = await db.prepare('SELECT * FROM gallery_folders WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Složka vytvořena', folder });
  } catch (error) {
    console.error('Error creating gallery folder:', error);
    const msg = handleUniqueError(error, 'Slug složky');
    res.status(error.message?.includes('UNIQUE') ? 400 : 500).json({ error: msg });
  }
});

// PUT /api/gallery/folders/:id – update folder
router.put('/folders/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name_cz, name_en, slug, parent_id, display_order } = req.body;

    if (!name_cz || !name_cz.trim()) {
      return res.status(400).json({ error: 'Název (CZ) je povinný' });
    }

    const existing = await db.prepare('SELECT * FROM gallery_folders WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Složka nenalezena' });

    const finalSlug = slug ? slug.trim() : generateSlug(name_cz.trim());

    if (!finalSlug || !/^[a-z0-9_-]{1,80}$/.test(finalSlug)) {
      return res.status(400).json({ error: 'Slug musí obsahovat pouze malá písmena, číslice, - nebo _ (max 80 znaků)' });
    }

    // Prevent self-reference
    if (parent_id && Number(parent_id) === id) {
      return res.status(400).json({ error: 'Složka nemůže být svou vlastní nadřazenou složkou' });
    }

    // Validate parent_id
    if (parent_id) {
      const parent = await db.prepare('SELECT id FROM gallery_folders WHERE id = ?').get(parent_id);
      if (!parent) return res.status(400).json({ error: 'Nadřazená složka neexistuje' });
    }

    await db.prepare(`
      UPDATE gallery_folders
      SET name_cz = ?, name_en = ?, slug = ?, parent_id = ?, display_order = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name_cz.trim(),
      name_en ? name_en.trim() : null,
      finalSlug,
      parent_id || null,
      display_order || 0,
      id
    );

    const folder = await db.prepare('SELECT * FROM gallery_folders WHERE id = ?').get(id);
    res.json({ message: 'Složka aktualizována', folder });
  } catch (error) {
    console.error('Error updating gallery folder:', error);
    const msg = handleUniqueError(error, 'Slug složky');
    res.status(error.message?.includes('UNIQUE') ? 400 : 500).json({ error: msg });
  }
});

// DELETE /api/gallery/folders/:id – delete (blocked if has children or images)
router.delete('/folders/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const folder = await db.prepare('SELECT * FROM gallery_folders WHERE id = ?').get(id);
    if (!folder) return res.status(404).json({ error: 'Složka nenalezena' });

    // Block if has sub-folders
    const childFolders = await db.prepare('SELECT COUNT(*) as cnt FROM gallery_folders WHERE parent_id = ?').get(id);
    if (childFolders.cnt > 0) {
      return res.status(400).json({
        error: `Složka "${folder.name_cz}" nelze smazat – obsahuje ${childFolders.cnt} podsložek. Nejprve smažte podsložky.`
      });
    }

    // Block if has images
    const images = await db.prepare('SELECT COUNT(*) as cnt FROM gallery_images WHERE folder_id = ?').get(id);
    if (images.cnt > 0) {
      return res.status(400).json({
        error: `Složka "${folder.name_cz}" nelze smazat – obsahuje ${images.cnt} fotek. Nejprve přesuňte nebo smažte fotky.`
      });
    }

    await db.prepare('DELETE FROM gallery_folders WHERE id = ?').run(id);
    res.json({ message: 'Složka smazána' });
  } catch (error) {
    console.error('Error deleting gallery folder:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// IMAGES
// ============================================================

// GET /api/gallery/images
// Query params:
//   folder=root          → WHERE folder_id IS NULL
//   folder=5             → WHERE folder_id = 5
//   (no folder param)    → all images (for global search)
//   search=abc           → filter by identifier / title_cz / title_en
router.get('/images', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { folder, search } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (folder !== undefined) {
      if (folder === 'root') {
        whereClause += ' AND folder_id IS NULL';
      } else {
        whereClause += ' AND folder_id = ?';
        params.push(Number(folder));
      }
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      whereClause += ' AND (identifier LIKE ? OR title_cz LIKE ? OR title_en LIKE ?)';
      params.push(q, q, q);
    }

    const images = await db.prepare(`
      SELECT gi.*, gf.name_cz as folder_name
      FROM gallery_images gi
      LEFT JOIN gallery_folders gf ON gi.folder_id = gf.id
      WHERE ${whereClause}
      ORDER BY gi.display_order ASC, gi.created_at DESC
    `).all(...params);

    res.json(images);
  } catch (error) {
    console.error('Error loading gallery images:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/gallery/images – create image
router.post('/images', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { folder_id, image_url, identifier, title_cz, title_en, description_cz, description_en, tags, display_order } = req.body;

    if (!image_url || !image_url.trim()) {
      return res.status(400).json({ error: 'URL obrázku je povinná' });
    }

    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ error: 'Identifier je povinný' });
    }

    const cleanId = identifier.trim().toLowerCase();
    if (!validateIdentifier(cleanId)) {
      return res.status(400).json({ error: 'Identifier smí obsahovat jen malá písmena, číslice, - nebo _ (max 80 znaků)' });
    }

    // Validate folder_id if provided
    if (folder_id) {
      const folder = await db.prepare('SELECT id FROM gallery_folders WHERE id = ?').get(folder_id);
      if (!folder) return res.status(400).json({ error: 'Složka neexistuje' });
    }

    const result = await db.prepare(`
      INSERT INTO gallery_images
        (folder_id, image_url, identifier, title_cz, title_en, description_cz, description_en, tags, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      folder_id || null,
      image_url.trim(),
      cleanId,
      title_cz ? title_cz.trim() : null,
      title_en ? title_en.trim() : null,
      description_cz ? description_cz.trim() : null,
      description_en ? description_en.trim() : null,
      tags ? tags.trim() : null,
      display_order || 0
    );

    const image = await db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Fotka přidána', image });
  } catch (error) {
    console.error('Error creating gallery image:', error);
    const msg = handleUniqueError(error, 'Identifier');
    res.status(error.message?.includes('UNIQUE') ? 400 : 500).json({ error: msg });
  }
});

// PUT /api/gallery/images/:id – update image (incl. folder move)
router.put('/images/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { folder_id, image_url, identifier, title_cz, title_en, description_cz, description_en, tags, display_order } = req.body;

    const existing = await db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Fotka nenalezena' });

    if (!image_url || !image_url.trim()) {
      return res.status(400).json({ error: 'URL obrázku je povinná' });
    }

    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ error: 'Identifier je povinný' });
    }

    const cleanId = identifier.trim().toLowerCase();
    if (!validateIdentifier(cleanId)) {
      return res.status(400).json({ error: 'Identifier smí obsahovat jen malá písmena, číslice, - nebo _ (max 80 znaků)' });
    }

    // Validate folder_id
    if (folder_id) {
      const folder = await db.prepare('SELECT id FROM gallery_folders WHERE id = ?').get(folder_id);
      if (!folder) return res.status(400).json({ error: 'Složka neexistuje' });
    }

    await db.prepare(`
      UPDATE gallery_images
      SET folder_id = ?, image_url = ?, identifier = ?, title_cz = ?, title_en = ?,
          description_cz = ?, description_en = ?, tags = ?, display_order = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      folder_id || null,
      image_url.trim(),
      cleanId,
      title_cz ? title_cz.trim() : null,
      title_en ? title_en.trim() : null,
      description_cz ? description_cz.trim() : null,
      description_en ? description_en.trim() : null,
      tags ? tags.trim() : null,
      display_order || 0,
      id
    );

    const image = await db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id);
    res.json({ message: 'Fotka aktualizována', image });
  } catch (error) {
    console.error('Error updating gallery image:', error);
    const msg = handleUniqueError(error, 'Identifier');
    res.status(error.message?.includes('UNIQUE') ? 400 : 500).json({ error: msg });
  }
});

// DELETE /api/gallery/images/:id
router.delete('/images/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const image = await db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id);
    if (!image) return res.status(404).json({ error: 'Fotka nenalezena' });

    await db.prepare('DELETE FROM gallery_images WHERE id = ?').run(id);
    res.json({ message: 'Fotka smazána' });
  } catch (error) {
    console.error('Error deleting gallery image:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// UPLOAD (multipart – multiple files)
// ============================================================

// POST /api/gallery/upload
// Body (multipart): files[], folder_id?, title_cz?, title_en?,
//   description_cz?, description_en?, tags?, display_order?
router.post('/upload', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, handleMultipart, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nebyl vybrán žádný soubor' });
    }

    const { folder_id, title_cz, title_en, description_cz, description_en, tags, display_order } = req.body;

    // Validate folder_id if provided
    if (folder_id) {
      const folder = await db.prepare('SELECT id FROM gallery_folders WHERE id = ?').get(folder_id);
      if (!folder) {
        return res.status(400).json({ error: 'Složka neexistuje' });
      }
    }

    const results = [];
    const errors  = [];

    for (const file of req.files) {
      const ext  = path.extname(file.originalname).toLowerCase();
      const base = sanitizeFilename(path.basename(file.originalname, ext));
      const filename   = `${base}-${Date.now()}${ext}`;
      const filepath   = path.join(UPLOAD_DIR, filename);
      const identifier = await uniqueIdentifier(filenameToIdentifier(path.basename(file.originalname, ext)));
      const imageUrl   = `/uploads/gallery/${filename}`;

      try {
        // Resize/compress before writing to disk
        const processedBuf = await resizeForWeb(file.buffer, file.mimetype);
        fs.writeFileSync(filepath, processedBuf);

        const result = await db.prepare(`
          INSERT INTO gallery_images
            (folder_id, image_url, identifier, title_cz, title_en,
             description_cz, description_en, tags, display_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          folder_id || null,
          imageUrl,
          identifier,
          title_cz  ? title_cz.trim()  : null,
          title_en  ? title_en.trim()  : null,
          description_cz ? description_cz.trim() : null,
          description_en ? description_en.trim() : null,
          tags ? tags.trim() : null,
          Number(display_order) || 0
        );

        const image = await db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(result.lastInsertRowid);
        results.push(image);
      } catch (err) {
        try { fs.unlinkSync(filepath); } catch {}
        errors.push({ filename: file.originalname, error: err.message });
      }
    }

    const status = results.length > 0 ? 201 : 400;
    res.status(status).json({
      message: `Nahráno ${results.length} z ${req.files.length} foto${req.files.length === 1 ? 'ky' : 'k'}`,
      images: results,
      errors
    });
  } catch (error) {
    console.error('Error uploading gallery images:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
