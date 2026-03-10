import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = path.join(__dirname, 'eolite.db');
console.log('📁 Database path:', dbPath);

// Async wrapper over sqlite3 (same pattern as KanjoWin)
class Database {
  constructor(filepath) {
    this.db = new sqlite3.Database(filepath, (err) => {
      if (err) {
        console.error('❌ Failed to open database:', err);
        throw err;
      }
      console.log('✅ Database opened successfully');
    });
    this.db.configure('busyTimeout', 30000);
  }

  exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params) => new Promise((resolve, reject) => {
        stmt.run(...params, function(err) {
          if (err) reject(err);
          else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
        });
      }),
      get: (...params) => new Promise((resolve, reject) => {
        stmt.get(...params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }),
      all: (...params) => new Promise((resolve, reject) => {
        stmt.all(...params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      })
    };
  }
}

const db = new Database(dbPath);

export async function initDatabase() {
  console.log('🔄 Starting database initialization...');

  // Users table (admin only – no public registration)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Reference categories
  await db.exec(`
    CREATE TABLE IF NOT EXISTS reference_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_cz TEXT NOT NULL,
      name_en TEXT,
      slug TEXT UNIQUE,
      tag TEXT,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Project references
  // NOTE: "references" is a reserved SQL keyword – using project_references to avoid conflicts
  await db.exec(`
    CREATE TABLE IF NOT EXISTS project_references (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      title_cz TEXT NOT NULL,
      title_en TEXT,
      description_cz TEXT,
      description_en TEXT,
      cover_image TEXT,
      gallery_json TEXT,
      is_featured INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(category_id) REFERENCES reference_categories(id)
    )
  `);

  // Add columns that may be missing (ALTER TABLE pattern)
  const refColumns = [
    { col: 'title_en', def: 'TEXT' },
    { col: 'description_en', def: 'TEXT' },
    { col: 'gallery_json', def: 'TEXT' }
  ];
  for (const { col, def } of refColumns) {
    try {
      await db.exec(`ALTER TABLE project_references ADD COLUMN ${col} ${def}`);
    } catch {
      // already exists
    }
  }

  // Magazine posts
  await db.exec(`
    CREATE TABLE IF NOT EXISTS magazine_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_cz TEXT NOT NULL,
      title_en TEXT,
      slug TEXT UNIQUE NOT NULL,
      content_cz TEXT,
      content_en TEXT,
      excerpt_cz TEXT,
      excerpt_en TEXT,
      cover_image TEXT,
      is_published INTEGER DEFAULT 0,
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Inquiries (poptávkový formulář)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      phone TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_read INTEGER DEFAULT 0
    )
  `);

  // Page content (simple key-value for editable website sections)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS page_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_key TEXT UNIQUE NOT NULL,
      section_title TEXT NOT NULL,
      content_cz TEXT,
      content_en TEXT,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default page sections
  const defaultSections = [
    { key: 'hero',        title: 'Hero sekce'    },
    { key: 'about',       title: 'O nás'         },
    { key: 'services',    title: 'Služby'        },
    { key: 'contact',     title: 'Kontakt'       },
    { key: 'footer',      title: 'Patička'       }
  ];

  for (const s of defaultSections) {
    try {
      await db.prepare(`
        INSERT OR IGNORE INTO page_content (section_key, section_title, content_cz, content_en)
        VALUES (?, ?, ?, ?)
      `).run(s.key, s.title, '', '');
    } catch {
      // already exists
    }
  }

  // Remove deprecated sections
  await db.prepare(`DELETE FROM page_content WHERE section_key = 'sales'`).run();

  console.log('✅ Page content table seeded');

  // Settings table – generic key/value store for admin-configurable options
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default settings
  await db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('notification_email', '')`).run();

  console.log('✅ Settings table ready');

  // Seed default admin user
  const passwordHash = bcrypt.hashSync('admin123', 10);
  try {
    await db.prepare(`
      INSERT OR IGNORE INTO users (email, password_hash, role)
      VALUES (?, ?, ?)
    `).run('admin@eolite.cz', passwordHash, 'admin');
    console.log('✅ Default admin created: admin@eolite.cz / admin123');
  } catch (error) {
    if (error.code !== 'SQLITE_CONSTRAINT') {
      console.error('Error seeding admin:', error);
    }
  }

  // Gallery folders (adjacency list – parent_id self-ref)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_cz TEXT NOT NULL,
      name_en TEXT,
      slug TEXT UNIQUE NOT NULL,
      parent_id INTEGER,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(parent_id) REFERENCES gallery_folders(id)
    )
  `);

  // Add updated_at if missing (existing DBs)
  try {
    await db.exec(`ALTER TABLE gallery_folders ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
  } catch { /* already exists */ }

  // Gallery images
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER,
      image_url TEXT NOT NULL,
      identifier TEXT UNIQUE NOT NULL,
      title_cz TEXT,
      title_en TEXT,
      description_cz TEXT,
      description_en TEXT,
      tags TEXT,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(folder_id) REFERENCES gallery_folders(id)
    )
  `);

  try {
    await db.exec(`ALTER TABLE gallery_images ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
  } catch { /* already exists */ }

  console.log('✅ Gallery tables initialized');

  console.log('✅ Database initialization complete');
}

export default db;
