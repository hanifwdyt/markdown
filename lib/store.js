// Storage dokumen markdown di SQLite. File DB ditaruh di persistent volume
// (lihat DATA_DIR) biar data ga ilang tiap redeploy.
import Database from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'markdown.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS docs (
    id         TEXT PRIMARY KEY,
    content    TEXT NOT NULL,
    theme      TEXT NOT NULL DEFAULT 'light',
    title      TEXT,
    created_at INTEGER NOT NULL,
    views      INTEGER NOT NULL DEFAULT 0
  );
`);

// Alfabet URL-safe tanpa karakter ambigu.
const nanoid = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 9);

const insertStmt = db.prepare(
  `INSERT INTO docs (id, content, theme, title, created_at) VALUES (?, ?, ?, ?, ?)`
);
const getStmt = db.prepare(`SELECT * FROM docs WHERE id = ?`);
const bumpStmt = db.prepare(`UPDATE docs SET views = views + 1 WHERE id = ?`);

export function createDoc({ content, theme, title }) {
  const id = nanoid();
  insertStmt.run(id, content, theme, title || null, Date.now());
  return id;
}

export function getDoc(id) {
  const row = getStmt.get(id);
  if (row) bumpStmt.run(id);
  return row || null;
}
