import pg from 'pg';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Mode detection ────────────────────────────────────────────────────────────
// DB_PROVIDER=postgres  → PostgreSQL (Neon / Railway)
// DB_PROVIDER=sqlite    → SQLite (local dev, zero setup)
// Nothing set           → SQLite (safe default)
const isPostgres = process.env.DB_PROVIDER === 'postgres';

logger.info('database_mode', { mode: isPostgres ? 'PostgreSQL' : 'SQLite' });

// Primary key token — only structural difference between the two engines
const pk = isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';

// ── PostgreSQL wrapper ────────────────────────────────────────────────────────
function createPgDb() {
  const { Pool } = pg;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  pool.on('error', (err) => logger.fromError('pg_pool_error', err));

  function convertPlaceholders(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  }

  return {
    _pool: pool,
    exec: async (sql) => { await pool.query(sql); },
    prepare: (sql) => {
      const isInsert = /^\s*INSERT/i.test(sql);
      const pgSql = convertPlaceholders(sql);
      const pgSqlRun = isInsert && !/RETURNING/i.test(sql)
        ? pgSql.replace(/;?\s*$/, '') + ' RETURNING id'
        : pgSql;

      return {
        run: async (...params) => {
          const result = await pool.query(pgSqlRun, params);
          return {
            lastInsertRowid: isInsert ? result.rows[0]?.id : undefined,
            changes: result.rowCount
          };
        },
        get: async (...params) => {
          const result = await pool.query(pgSql, params);
          return result.rows[0];
        },
        all: async (...params) => {
          const result = await pool.query(pgSql, params);
          return result.rows;
        }
      };
    }
  };
}

// ── SQLite wrapper ────────────────────────────────────────────────────────────
function createSqliteDb() {
  const dbPath = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.join(__dirname, 'eolite.db');

  const sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) { logger.fromError('sqlite_open_failed', err); throw err; }
    logger.info('sqlite_opened', { dbPath });
  });
  sqliteDb.configure('busyTimeout', 30000);

  return {
    exec: (sql) => new Promise((resolve, reject) => {
      sqliteDb.exec(sql, (err) => err ? reject(err) : resolve());
    }),
    prepare: (sql) => {
      const stmt = sqliteDb.prepare(sql);
      return {
        run: (...params) => new Promise((resolve, reject) => {
          stmt.run(...params, function(err) {
            if (err) reject(err);
            else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
          });
        }),
        get: (...params) => new Promise((resolve, reject) => {
          stmt.get(...params, (err, row) => err ? reject(err) : resolve(row));
        }),
        all: (...params) => new Promise((resolve, reject) => {
          stmt.all(...params, (err, rows) => err ? reject(err) : resolve(rows));
        })
      };
    }
  };
}

// ── Export the right driver ───────────────────────────────────────────────────
const db = isPostgres ? createPgDb() : createSqliteDb();

// ── Schema initialization ─────────────────────────────────────────────────────
// Uses ${pk} for primary keys.
// TIMESTAMP, ON CONFLICT (col) DO NOTHING, and UNIQUE constraints work in
// both SQLite ≥3.24 and PostgreSQL — no branching needed in the schema.
export async function initDatabase() {
  logger.info('database_init_start');

  // Users (admin only – no public registration)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            ${pk},
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT DEFAULT 'admin',
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('table_ready', { table: 'users' });

  // Reference categories
  await db.exec(`
    CREATE TABLE IF NOT EXISTS reference_categories (
      id            ${pk},
      name_cz       TEXT NOT NULL,
      name_en       TEXT,
      slug          TEXT UNIQUE,
      tag           TEXT,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('table_ready', { table: 'reference_categories' });

  // Project references
  // NOTE: named project_references (not "references") to avoid SQL keyword conflict
  await db.exec(`
    CREATE TABLE IF NOT EXISTS project_references (
      id             ${pk},
      category_id    INTEGER NOT NULL,
      title_cz       TEXT NOT NULL,
      title_en       TEXT,
      description_cz TEXT,
      description_en TEXT,
      cover_image    TEXT,
      gallery_json   TEXT,
      is_featured    INTEGER DEFAULT 0,
      is_active      INTEGER DEFAULT 1,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES reference_categories(id)
    )
  `);
  logger.info('table_ready', { table: 'project_references' });

  // Magazine posts
  await db.exec(`
    CREATE TABLE IF NOT EXISTS magazine_posts (
      id           ${pk},
      title_cz     TEXT NOT NULL,
      title_en     TEXT,
      slug         TEXT UNIQUE NOT NULL,
      content_cz   TEXT,
      content_en   TEXT,
      excerpt_cz   TEXT,
      excerpt_en   TEXT,
      cover_image  TEXT,
      is_published INTEGER DEFAULT 0,
      published_at TIMESTAMP,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('table_ready', { table: 'magazine_posts' });

  // Inquiries
  await db.exec(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id         ${pk},
      name       TEXT,
      email      TEXT,
      phone      TEXT,
      message    TEXT,
      is_read    INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('table_ready', { table: 'inquiries' });

  // Page content (key-value for editable sections)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS page_content (
      id            ${pk},
      section_key   TEXT UNIQUE NOT NULL,
      section_title TEXT NOT NULL,
      content_cz    TEXT,
      content_en    TEXT,
      image_url     TEXT,
      is_active     INTEGER DEFAULT 1,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const defaultSections = [
    { key: 'hero',     title: 'Hero sekce' },
    { key: 'about',    title: 'O nás'      },
    { key: 'services', title: 'Služby'     },
    { key: 'contact',  title: 'Kontakt'    },
    { key: 'footer',   title: 'Patička'    }
  ];
  for (const s of defaultSections) {
    await db.prepare(
      `INSERT INTO page_content (section_key, section_title, content_cz, content_en)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (section_key) DO NOTHING`
    ).run(s.key, s.title, '', '');
  }
  logger.info('table_ready', { table: 'page_content' });

  // Settings (text primary key – not SERIAL)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO NOTHING`
  ).run('notification_email', '');
  logger.info('table_ready', { table: 'settings' });

  // Gallery folders (adjacency list)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_folders (
      id            ${pk},
      name_cz       TEXT NOT NULL,
      name_en       TEXT,
      slug          TEXT UNIQUE NOT NULL,
      parent_id     INTEGER,
      display_order INTEGER DEFAULT 0,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES gallery_folders(id)
    )
  `);
  logger.info('table_ready', { table: 'gallery_folders' });

  // Gallery images
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_images (
      id             ${pk},
      folder_id      INTEGER,
      image_url      TEXT NOT NULL,
      identifier     TEXT UNIQUE NOT NULL,
      title_cz       TEXT,
      title_en       TEXT,
      description_cz TEXT,
      description_en TEXT,
      tags           TEXT,
      display_order  INTEGER DEFAULT 0,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES gallery_folders(id)
    )
  `);
  logger.info('table_ready', { table: 'gallery_images' });

  // Seed default admin user
  const passwordHash = bcrypt.hashSync('admin123', 10);
  await db.prepare(
    `INSERT INTO users (email, password_hash, role)
     VALUES (?, ?, ?)
     ON CONFLICT (email) DO NOTHING`
  ).run('admin@eolite.cz', passwordHash, 'admin');

  logger.info('database_init_complete');
  logger.info('admin_user_seeded', { email: 'admin@eolite.cz' });
}

export default db;
