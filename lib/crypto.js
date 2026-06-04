// Kriptografi: hash password akun (scrypt, one-way), encrypt passcode dokumen
// (AES-256-GCM, reversible biar bisa di-reveal), dan signing cookie.
//
// Kenapa passcode di-encrypt bukan di-hash: requirement-nya owner bisa LIHAT
// lagi passcode-nya kalau lupa (setelah verifikasi password akun). Hash ga
// bisa dibalik, jadi pake symmetric encryption dengan master key.
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');

// Load-or-create kunci yang stabil lintas restart. Disimpen di persistent
// volume biar passcode yang udah ke-encrypt tetep bisa di-decrypt.
function loadKeys() {
  const fromEnv = {
    masterKey: process.env.MASTER_KEY,
    sessionSecret: process.env.SESSION_SECRET,
  };
  if (fromEnv.masterKey && fromEnv.sessionSecret) {
    return {
      masterKey: Buffer.from(fromEnv.masterKey, 'hex'),
      sessionSecret: fromEnv.sessionSecret,
    };
  }
  const file = path.join(DATA_DIR, 'keys.json');
  let keys;
  try {
    keys = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    keys = {
      masterKey: crypto.randomBytes(32).toString('hex'),
      sessionSecret: crypto.randomBytes(32).toString('hex'),
    };
    fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  }
  return {
    masterKey: Buffer.from(fromEnv.masterKey || keys.masterKey, 'hex'),
    sessionSecret: fromEnv.sessionSecret || keys.sessionSecret,
  };
}

const { masterKey, sessionSecret } = loadKeys();

export const SESSION_SECRET = sessionSecret;

// ---- Password akun (scrypt) ----
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ---- Passcode dokumen (AES-256-GCM, reversible) ----
export function encryptPasscode(passcode) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const enc = Buffer.concat([cipher.update(String(passcode), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptPasscode(blob) {
  try {
    const [ivHex, tagHex, encHex] = String(blob).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

// Banding passcode tanpa bocorin timing.
export function passcodeMatches(input, blob) {
  const real = decryptPasscode(blob);
  if (real == null) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(real);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
