// Query dokumen markdown. Dokumen bisa anonim (user_id null) atau dimiliki user.
import { customAlphabet } from 'nanoid';
import { db } from './db.js';
import { encryptPasscode } from './crypto.js';

// Alfabet URL-safe tanpa karakter ambigu.
const nanoid = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 9);

const insertStmt = db.prepare(
  `INSERT INTO docs (id, user_id, content, theme, font, title, passcode_enc, created_at, updated_at)
   VALUES (@id, @user_id, @content, @theme, @font, @title, @passcode_enc, @ts, @ts)`
);
const getStmt = db.prepare(`SELECT * FROM docs WHERE id = ?`);
const bumpStmt = db.prepare(`UPDATE docs SET views = views + 1 WHERE id = ?`);
const getBySlugStmt = db.prepare(`SELECT * FROM docs WHERE slug = ?`);
const slugOwnerStmt = db.prepare(`SELECT id FROM docs WHERE slug = ?`);
const setSlugStmt = db.prepare(
  `UPDATE docs SET slug = @slug, updated_at = @ts WHERE id = @id AND user_id = @user_id`
);
const listStmt = db.prepare(
  `SELECT id, slug, title, theme, font, created_at, updated_at, views,
          (passcode_enc IS NOT NULL) AS has_passcode
     FROM docs WHERE user_id = ? ORDER BY updated_at DESC`
);
const updateStmt = db.prepare(
  `UPDATE docs SET content = @content, theme = @theme, font = @font, title = @title, updated_at = @ts
     WHERE id = @id AND user_id = @user_id`
);
const setPasscodeStmt = db.prepare(
  `UPDATE docs SET passcode_enc = @passcode_enc, updated_at = @ts
     WHERE id = @id AND user_id = @user_id`
);
const deleteStmt = db.prepare(`DELETE FROM docs WHERE id = ? AND user_id = ?`);

export function createDoc({ content, theme, font = 'serif', title, userId = null, passcode = null }) {
  const id = nanoid();
  insertStmt.run({
    id,
    user_id: userId,
    content,
    theme,
    font,
    title: title || null,
    passcode_enc: passcode ? encryptPasscode(passcode) : null,
    ts: Date.now(),
  });
  return id;
}

// Ambil dokumen + naikin view counter (buat view page publik).
export function getDoc(id) {
  const row = getStmt.get(id);
  if (row) bumpStmt.run(id);
  return row || null;
}

// Ambil tanpa naikin view (buat owner ngedit / cek gate).
export function peekDoc(id) {
  return getStmt.get(id) || null;
}

export function bumpView(id) {
  bumpStmt.run(id);
}

export function listDocs(userId) {
  return listStmt.all(userId).map((r) => ({ ...r, has_passcode: !!r.has_passcode }));
}

// Update konten dokumen milik user. Return true kalau kena 1 baris.
export function updateDoc({ id, userId, content, theme, font = 'serif', title }) {
  const res = updateStmt.run({
    id,
    user_id: userId,
    content,
    theme,
    font,
    title: title || null,
    ts: Date.now(),
  });
  return res.changes > 0;
}

// Set / hapus passcode (passcode null/'' = hapus). Hanya milik user.
export function setPasscode({ id, userId, passcode }) {
  const res = setPasscodeStmt.run({
    id,
    user_id: userId,
    passcode_enc: passcode ? encryptPasscode(passcode) : null,
    ts: Date.now(),
  });
  return res.changes > 0;
}

export function deleteDoc(id, userId) {
  return deleteStmt.run(id, userId).changes > 0;
}

export function getBySlug(slug) {
  return getBySlugStmt.get(slug) || null;
}

// Resolusi dokumen by id ATAU slug (id diutamakan).
export function resolveDoc(param) {
  return peekDoc(param) || getBySlug(param);
}

// Slug udah dipakai dokumen lain (atau bentrok sama id dokumen lain)?
export function slugTaken(slug, exceptId) {
  const bySlug = slugOwnerStmt.get(slug);
  if (bySlug && bySlug.id !== exceptId) return true;
  const byId = getStmt.get(slug); // hindari slug yg sama persis kayak id orang lain
  if (byId && byId.id !== exceptId) return true;
  return false;
}

// Set / hapus slug (slug null/'' = hapus). Hanya milik user.
export function setSlug({ id, userId, slug }) {
  return setSlugStmt.run({ id, user_id: userId, slug: slug || null, ts: Date.now() }).changes > 0;
}
