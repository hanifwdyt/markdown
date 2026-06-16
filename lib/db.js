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
ensureColumn('docs', 'font', "font TEXT NOT NULL DEFAULT 'serif'"); // font dokumen

// Dir = kumpulan dokumen yang bisa diakses publik di /dir/<slug>.
// Relasi dir<->doc many-to-many lewat dir_docs (1 doc bisa masuk banyak dir).
db.exec(`
  CREATE TABLE IF NOT EXISTS dirs (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    title       TEXT,
    description TEXT,
    theme       TEXT NOT NULL DEFAULT 'light',
    font        TEXT NOT NULL DEFAULT 'serif',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dir_docs (
    dir_id   TEXT NOT NULL REFERENCES dirs(id)  ON DELETE CASCADE,
    doc_id   TEXT NOT NULL REFERENCES docs(id)  ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (dir_id, doc_id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_docs_user ON docs(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_slug ON docs(slug);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_dirs_slug ON dirs(slug);
  CREATE INDEX IF NOT EXISTS idx_dirs_user ON dirs(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_dir_docs_dir ON dir_docs(dir_id, position);
  CREATE INDEX IF NOT EXISTS idx_dir_docs_doc ON dir_docs(doc_id);
`);

// Backfill updated_at buat baris lama.
db.prepare(`UPDATE docs SET updated_at = created_at WHERE updated_at IS NULL`).run();
