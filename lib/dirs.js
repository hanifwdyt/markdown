// Query "dir" — kumpulan dokumen yang dipublikasikan di /dir/<slug>.
// Relasi ke docs many-to-many lewat tabel dir_docs (lihat lib/db.js).
import { customAlphabet } from 'nanoid';
import { db } from './db.js';

// Alfabet URL-safe tanpa karakter ambigu (sama kayak store.js).
const nanoid = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 9);

const insertStmt = db.prepare(
  `INSERT INTO dirs (id, user_id, slug, title, description, theme, font, created_at, updated_at)
   VALUES (@id, @user_id, @slug, @title, @description, @theme, @font, @ts, @ts)`
);
const getStmt = db.prepare(`SELECT * FROM dirs WHERE id = ?`);
const getBySlugStmt = db.prepare(`SELECT * FROM dirs WHERE slug = ?`);
const slugOwnerStmt = db.prepare(`SELECT id FROM dirs WHERE slug = ?`);
const listStmt = db.prepare(
  `SELECT d.*, (SELECT COUNT(*) FROM dir_docs dd WHERE dd.dir_id = d.id) AS doc_count
     FROM dirs d WHERE d.user_id = ? ORDER BY d.updated_at DESC`
);
const updateStmt = db.prepare(
  `UPDATE dirs SET title = @title, description = @description, theme = @theme, font = @font, updated_at = @ts
     WHERE id = @id AND user_id = @user_id`
);
const setSlugStmt = db.prepare(
  `UPDATE dirs SET slug = @slug, updated_at = @ts WHERE id = @id AND user_id = @user_id`
);
const deleteStmt = db.prepare(`DELETE FROM dirs WHERE id = ? AND user_id = ?`);
const touchStmt = db.prepare(`UPDATE dirs SET updated_at = @ts WHERE id = @id`);

// Membership.
const maxPosStmt = db.prepare(
  `SELECT COALESCE(MAX(position), -1) AS maxpos FROM dir_docs WHERE dir_id = ?`
);
const addMemberStmt = db.prepare(
  `INSERT OR IGNORE INTO dir_docs (dir_id, doc_id, position, added_at)
   VALUES (@dir_id, @doc_id, @position, @ts)`
);
const removeMemberStmt = db.prepare(`DELETE FROM dir_docs WHERE dir_id = ? AND doc_id = ?`);
const memberStmt = db.prepare(`SELECT 1 FROM dir_docs WHERE dir_id = ? AND doc_id = ?`);
const setPosStmt = db.prepare(
  `UPDATE dir_docs SET position = @position WHERE dir_id = @dir_id AND doc_id = @doc_id`
);

// Dokumen-dokumen di dalam sebuah dir, urut posisi lalu terbaru.
const docsInDirStmt = db.prepare(
  `SELECT doc.id, doc.slug, doc.title, doc.theme, doc.font, doc.views,
          doc.created_at, doc.updated_at, dd.position,
          (doc.passcode_enc IS NOT NULL) AS has_passcode
     FROM dir_docs dd
     JOIN docs doc ON doc.id = dd.doc_id
    WHERE dd.dir_id = ?
    ORDER BY dd.position ASC, doc.updated_at DESC`
);

export function createDir({ userId, slug, title = null, description = null, theme = 'light', font = 'serif' }) {
  const id = nanoid();
  insertStmt.run({
    id, user_id: userId, slug,
    title: title || null,
    description: description || null,
    theme, font, ts: Date.now(),
  });
  return id;
}

export function getDir(id) {
  return getStmt.get(id) || null;
}

export function getDirBySlug(slug) {
  return getBySlugStmt.get(slug) || null;
}

// Resolusi dir by id ATAU slug (id diutamakan).
export function resolveDir(param) {
  return getStmt.get(param) || getBySlugStmt.get(param) || null;
}

export function listDirs(userId) {
  return listStmt.all(userId);
}

export function listDocsInDir(dirId) {
  return docsInDirStmt.all(dirId).map((r) => ({ ...r, has_passcode: !!r.has_passcode }));
}

export function updateDir({ id, userId, title, description, theme, font }) {
  return updateStmt.run({
    id, user_id: userId,
    title: title || null,
    description: description || null,
    theme, font, ts: Date.now(),
  }).changes > 0;
}

export function setDirSlug({ id, userId, slug }) {
  return setSlugStmt.run({ id, user_id: userId, slug, ts: Date.now() }).changes > 0;
}

export function deleteDir(id, userId) {
  return deleteStmt.run(id, userId).changes > 0;
}

// Slug udah dipakai dir lain?
export function dirSlugTaken(slug, exceptId) {
  const row = slugOwnerStmt.get(slug);
  return !!(row && row.id !== exceptId);
}

// Tambah doc ke dir (append di akhir). Idempoten (PK dir_id+doc_id).
export function addDocToDir({ dirId, docId }) {
  const { maxpos } = maxPosStmt.get(dirId);
  const res = addMemberStmt.run({ dir_id: dirId, doc_id: docId, position: maxpos + 1, ts: Date.now() });
  touchStmt.run({ id: dirId, ts: Date.now() });
  return res.changes > 0; // false kalau udah ada
}

export function removeDocFromDir({ dirId, docId }) {
  const res = removeMemberStmt.run(dirId, docId);
  if (res.changes > 0) touchStmt.run({ id: dirId, ts: Date.now() });
  return res.changes > 0;
}

export function isDocInDir(dirId, docId) {
  return !!memberStmt.get(dirId, docId);
}

// Set ulang urutan doc dalam dir sesuai array docId (yang ga disebut diabaikan).
export function reorderDir({ dirId, docIds }) {
  const tx = db.transaction((ids) => {
    ids.forEach((docId, i) => setPosStmt.run({ dir_id: dirId, doc_id: docId, position: i }));
    touchStmt.run({ id: dirId, ts: Date.now() });
  });
  tx(docIds);
}
