// Koneksi SQLite terpusat + migrasi. File DB di persistent volume (DATA_DIR)
// biar data ga ilang tiap redeploy.
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'markdown.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Tabel dasar.
db.exec(`
  CREATE TABLE IF NOT EXISTS docs (
    id         TEXT PRIMARY KEY,
    content    TEXT NOT NULL,
    theme      TEXT NOT NULL DEFAULT 'light',
    title      TEXT,
    created_at INTEGER NOT NULL,
    views      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

// Migrasi inkremental buat kolom baru di docs (idempoten).
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

ensureColumn('docs', 'user_id', 'user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
ensureColumn('docs', 'passcode_enc', 'passcode_enc TEXT'); // null = ga ada passcode
ensureColumn('docs', 'updated_at', 'updated_at INTEGER');
ensureColumn('docs', 'slug', 'slug TEXT'); // custom URL, null = pakai id

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_docs_user ON docs(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_slug ON docs(slug);
`);

// Backfill updated_at buat baris lama.
db.prepare(`UPDATE docs SET updated_at = created_at WHERE updated_at IS NULL`).run();
