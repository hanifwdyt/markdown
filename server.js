import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { renderMarkdown, extractTitle } from './lib/render.js';
import { resolveTheme, themeVarsCss, hljsTheme, THEMES, DEFAULT_THEME } from './lib/themes.js';
import {
  createDoc, getDoc, peekDoc, bumpView, listDocs, updateDoc, setPasscode, deleteDoc,
} from './lib/store.js';
import {
  registerUser, authenticate, createSession, destroySession, userFromSession,
  verifyUserPassword, isValidEmail,
} from './lib/users.js';
import { SESSION_SECRET, passcodeMatches, decryptPasscode } from './lib/crypto.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BYTES = 200 * 1024; // batas ukuran markdown per dokumen
const PROD = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'https:', 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser(SESSION_SECRET));

// Attach req.user dari session cookie (kalau ada).
app.use((req, _res, next) => {
  req.user = userFromSession(req.cookies?.sid) || null;
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Harus login dulu.' });
  next();
}

function cookieOpts(maxAge) {
  return { httpOnly: true, sameSite: 'lax', secure: PROD, path: '/', maxAge };
}

// Static: app shell + highlight.js themes.
app.use(express.static(path.join(__dirname, 'public')));
app.use('/hljs', express.static(path.dirname(require.resolve('highlight.js/styles/github.css'))));

app.get('/livez', (_req, res) => res.send('ok'));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Halaman dengan URL bersih.
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/app', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// ──────────────────────────── AUTH ────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

app.post('/api/auth/register', authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const result = registerUser(email, password);
  if (result.error) return res.status(400).json({ error: result.error });
  const { token, maxAge } = createSession(result.user.id);
  res.cookie('sid', token, cookieOpts(maxAge));
  res.json({ user: result.user });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const user = authenticate(email, password);
  if (!user) return res.status(401).json({ error: 'Email atau password salah.' });
  const { token, maxAge } = createSession(user.id);
  res.cookie('sid', token, cookieOpts(maxAge));
  res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  destroySession(req.cookies?.sid);
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user });
});

// ──────────────────────────── DOCS ────────────────────────────
const writeLimiter = rateLimit({ windowMs: 60_000, max: 40, standardHeaders: true, legacyHeaders: false });

function tooBig(content) {
  return Buffer.byteLength(content, 'utf8') > MAX_BYTES;
}

// Bikin dokumen baru. Anonim = quick share; login = kesimpen ke akun (+passcode).
app.post('/api/docs', writeLimiter, (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  const theme = resolveTheme(req.body?.theme);
  if (!content.trim()) return res.status(400).json({ error: 'Markdown kosong.' });
  if (tooBig(content)) return res.status(413).json({ error: 'Markdown kegedean (maks 200KB).' });

  const title = extractTitle(content);
  // Passcode cuma berlaku buat user login (perlu akun buat recovery).
  const passcode = req.user && req.body?.passcode ? String(req.body.passcode) : null;
  const id = createDoc({ content, theme, title, userId: req.user?.id || null, passcode });
  res.json({ id, url: `/d/${id}`, owned: !!req.user });
});

// List dokumen milik user.
app.get('/api/docs', requireAuth, (req, res) => {
  res.json({ docs: listDocs(req.user.id) });
});

// Ambil 1 dokumen milik user (buat edit). Sertakan status passcode.
app.get('/api/docs/:id', requireAuth, (req, res) => {
  const doc = peekDoc(req.params.id);
  if (!doc || doc.user_id !== req.user.id) return res.status(404).json({ error: 'Ga ketemu.' });
  res.json({
    doc: {
      id: doc.id, content: doc.content, theme: doc.theme, title: doc.title,
      has_passcode: !!doc.passcode_enc, created_at: doc.created_at, updated_at: doc.updated_at,
    },
  });
});

// Update konten dokumen milik user.
app.put('/api/docs/:id', writeLimiter, requireAuth, (req, res) => {
  const doc = peekDoc(req.params.id);
  if (!doc || doc.user_id !== req.user.id) return res.status(404).json({ error: 'Ga ketemu.' });

  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  if (!content.trim()) return res.status(400).json({ error: 'Markdown kosong.' });
  if (tooBig(content)) return res.status(413).json({ error: 'Markdown kegedean (maks 200KB).' });

  updateDoc({
    id: doc.id, userId: req.user.id, content,
    theme: resolveTheme(req.body?.theme), title: extractTitle(content),
  });
  res.json({ ok: true, id: doc.id, url: `/d/${doc.id}` });
});

// Set / ganti / hapus passcode dokumen.
app.put('/api/docs/:id/passcode', writeLimiter, requireAuth, (req, res) => {
  const doc = peekDoc(req.params.id);
  if (!doc || doc.user_id !== req.user.id) return res.status(404).json({ error: 'Ga ketemu.' });

  const raw = req.body?.passcode;
  const passcode = raw == null ? '' : String(raw).trim();
  if (passcode && passcode.length > 64) return res.status(400).json({ error: 'Passcode kepanjangan.' });

  setPasscode({ id: doc.id, userId: req.user.id, passcode: passcode || null });
  res.json({ ok: true, has_passcode: !!passcode });
});

// Reveal passcode: butuh password akun lagi (anti bahu-melirik / sesi nyangkut).
app.post('/api/docs/:id/reveal-passcode', authLimiter, requireAuth, (req, res) => {
  const doc = peekDoc(req.params.id);
  if (!doc || doc.user_id !== req.user.id) return res.status(404).json({ error: 'Ga ketemu.' });
  if (!doc.passcode_enc) return res.status(400).json({ error: 'Dokumen ini ga ada passcode.' });

  const { password } = req.body || {};
  if (!verifyUserPassword(req.user.id, String(password || ''))) {
    return res.status(403).json({ error: 'Password akun salah.' });
  }
  res.json({ passcode: decryptPasscode(doc.passcode_enc) });
});

app.delete('/api/docs/:id', requireAuth, (req, res) => {
  const ok = deleteDoc(req.params.id, req.user.id);
  if (!ok) return res.status(404).json({ error: 'Ga ketemu.' });
  res.json({ ok: true });
});

// Unlock dokumen ber-passcode → set signed cookie biar ga ditanya terus.
const unlockLimiter = rateLimit({ windowMs: 5 * 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
app.post('/api/docs/:id/unlock', unlockLimiter, (req, res) => {
  const doc = peekDoc(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Ga ketemu.' });
  if (!doc.passcode_enc) return res.json({ ok: true }); // ga ada passcode, ya udah
  if (!passcodeMatches(String(req.body?.passcode || ''), doc.passcode_enc)) {
    return res.status(403).json({ error: 'Passcode salah.' });
  }
  res.cookie(`ul_${doc.id}`, '1', { ...cookieOpts(24 * 60 * 60 * 1000), signed: true });
  res.json({ ok: true });
});

// Preview live buat editor — render sama persis kayak view page.
const previewLimiter = rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false });
app.post('/api/preview', previewLimiter, (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  if (tooBig(content)) return res.status(413).json({ error: 'Markdown kegedean (maks 200KB).' });
  res.json({ html: renderMarkdown(content) });
});

// Daftar tema buat dipakai editor.
app.get('/api/themes', (_req, res) => {
  res.json({
    default: DEFAULT_THEME,
    themes: Object.fromEntries(
      Object.entries(THEMES).map(([k, v]) => [k, { name: v.name, vars: v.vars }])
    ),
  });
});

// ──────────────────────────── VIEW ────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function viewPage({ title, theme, contentHtml }) {
  const t = resolveTheme(theme);
  return `<!DOCTYPE html>
<html lang="id" data-theme="${t}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · markdown.hanif.app</title>
<link rel="stylesheet" href="/hljs/${hljsTheme(t)}.min.css">
<link rel="stylesheet" href="/view.css">
<style>${themeVarsCss(t)}</style>
</head>
<body>
<main class="doc">
${contentHtml}
</main>
<footer class="doc-footer">
  <a href="/">✎ markdown.hanif.app</a>
</footer>
</body>
</html>`;
}

// Apakah requester boleh lihat konten dokumen?
function canView(req, doc) {
  if (!doc.passcode_enc) return true; // publik
  if (req.user && req.user.id === doc.user_id) return true; // owner bypass
  return req.signedCookies?.[`ul_${doc.id}`] === '1'; // udah unlock
}

// View page: render dokumen server-side dengan tema (+ gate passcode).
app.get('/d/:id', (req, res) => {
  const doc = peekDoc(req.params.id);
  if (!doc) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));

  if (!canView(req, doc)) {
    return res.sendFile(path.join(__dirname, 'public', 'unlock.html'));
  }

  bumpView(doc.id);
  const theme = resolveTheme(req.query.theme || doc.theme);
  res.type('html').send(viewPage({ title: doc.title || 'Untitled', theme, contentHtml: renderMarkdown(doc.content) }));
});

// Raw markdown (hormati passcode gate).
app.get('/raw/:id', (req, res) => {
  const doc = peekDoc(req.params.id);
  if (!doc) return res.status(404).send('Not found');
  if (!canView(req, doc)) return res.status(401).send('Protected. Unlock via /d/' + doc.id);
  bumpView(doc.id);
  res.type('text/plain; charset=utf-8').send(doc.content);
});

app.listen(PORT, () => {
  console.log(`markdown.hanif.app listening on :${PORT}`);
});
