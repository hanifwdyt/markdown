// User + session. Session disimpen server-side (tabel sessions), token random
// dikirim via cookie httpOnly.
import crypto from 'node:crypto';
import { customAlphabet } from 'nanoid';
import { db } from './db.js';
import { hashPassword, verifyPassword } from './crypto.js';

const userId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

const insertUser = db.prepare(
  `INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`
);
const findByEmail = db.prepare(`SELECT * FROM users WHERE email = ?`);
const findById = db.prepare(`SELECT * FROM users WHERE id = ?`);

const insertSession = db.prepare(
  `INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
);
const getSession = db.prepare(`SELECT * FROM sessions WHERE id = ?`);
const delSession = db.prepare(`DELETE FROM sessions WHERE id = ?`);
const purgeExpired = db.prepare(`DELETE FROM sessions WHERE expires_at < ?`);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizeEmail(email));
}

export function registerUser(email, password) {
  const e = normalizeEmail(email);
  if (!isValidEmail(e)) return { error: 'Email ga valid.' };
  if (String(password).length < 8) return { error: 'Password minimal 8 karakter.' };
  if (findByEmail.get(e)) return { error: 'Email udah kedaftar.' };

  const id = userId();
  insertUser.run(id, e, hashPassword(password), Date.now());
  return { user: { id, email: e } };
}

export function authenticate(email, password) {
  const row = findByEmail.get(normalizeEmail(email));
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, email: row.email };
}

// Verifikasi password buat user yang udah login (dipakai reveal passcode).
export function verifyUserPassword(userId, password) {
  const row = findById.get(userId);
  return !!row && verifyPassword(password, row.password_hash);
}

export function createSession(uid) {
  purgeExpired.run(Date.now());
  const token = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  insertSession.run(token, uid, now, now + SESSION_TTL_MS);
  return { token, maxAge: SESSION_TTL_MS };
}

export function destroySession(token) {
  if (token) delSession.run(token);
}

// Ambil user dari token session, null kalau invalid/expired.
export function userFromSession(token) {
  if (!token) return null;
  const s = getSession.get(token);
  if (!s) return null;
  if (s.expires_at < Date.now()) {
    delSession.run(token);
    return null;
  }
  const u = findById.get(s.user_id);
  return u ? { id: u.id, email: u.email } : null;
}
