import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { renderMarkdown, extractTitle } from './lib/render.js';
import { resolveTheme, themeVarsCss, hljsTheme, THEMES, DEFAULT_THEME } from './lib/themes.js';
import { resolveFont, fontStack, FONTS, DEFAULT_FONT } from './lib/fonts.js';
import {
  createDoc, getDoc, peekDoc, bumpView, listDocs, updateDoc, setPasscode, deleteDoc,
  resolveDoc, slugTaken, setSlug,
} from './lib/store.js';
import {
  registerUser, authenticate, createSession, destroySession, userFromSession,
  verifyUserPassword, isValidEmail,
} from './lib/users.js';
import { SESSION_SECRET, passcodeMatches, decryptPasscode } from './lib/crypto.js';
import { uploadImage, r2Configured, ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from './lib/r2.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BYTES = 200 * 1024; // batas ukuran markdown per dokumen
const PROD = process.env.NODE_ENV === 'production';

// Kata yang ga boleh jadi slug (bentrok sama route / file statis).
const RESERVED_SLUGS = new Set([
  'd', 'raw', 'api', 'app', 'login', 'logout', 'vendor', 'hljs', 'livez',
  'healthz', 'assets', 'static', 'public', 'admin', 'me', 'dashboard',
  'register', 'new', 'edit', 'settings', 'about', 'help', 'index', 'favicon',
  'robots', 'mermaid-run', 'auth', 'styles', 'view',
]);

// Validasi slug custom. Return { slug } atau { error }.
function validateSlug(input) {
  const slug = String(input || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
    return { error: 'Slug 3-50 karakter, huruf kecil/angka/strip, ga boleh diawali/diakhiri strip.' };
  }
  if (RESERVED_SLUGS.has(slug)) return { error: 'Slug itu dipakai sistem, pilih yang lain.' };
  return { slug };
}

// URL kanonik dokumen: pakai slug kalau ada, fallback ke /d/<id>.
function docUrl(doc) {
  return doc.slug ? `/${doc.slug}` : `/d/${doc.id}`;
}

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
// Bundle mermaid (self-contained, di-load lazy oleh mermaid-run.js).
app.get('/vendor/mermaid.min.js', (_req, res) =>
  res.type('application/javascript').sendFile(require.resolve('mermaid/dist/mermaid.min.js')));

app.get('/livez', (_req, res) => res.send('ok'));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Halaman dengan URL bersih.
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/app', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/api', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'api-docs.html')));

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

// ──────────────────────── PUBLIC API (v1) ────────────────────────
// Akses programatik: tukar credentials -> token Bearer, lalu tarik
// list short link pakai token itu. Token = session (berlaku 30 hari).
function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}
function bearerToken(req) {
  const h = req.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
function requireApiAuth(req, res, next) {
  const user = userFromSession(bearerToken(req));
  if (!user) return res.status(401).json({ error: 'Token tidak valid atau kadaluarsa.' });
  req.apiUser = user;
  next();
}

// Tukar email+password jadi token Bearer.
app.post('/api/v1/auth/token', authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const user = authenticate(email, password);
  if (!user) return res.status(401).json({ error: 'Email atau password salah.' });
  const { token, maxAge } = createSession(user.id);
  res.json({
    token,
    token_type: 'Bearer',
    expires_in: Math.floor(maxAge / 1000),
    user: { email: user.email },
  });
});

const apiWriteLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

// List semua short link milik pemegang token.
app.get('/api/v1/docs', requireApiAuth, (req, res) => {
  const root = baseUrl(req);
  const docs = listDocs(req.apiUser.id).map((d) => ({
    id: d.id,
    title: d.title || 'Untitled',
    url: root + (d.slug ? `/${d.slug}` : `/d/${d.id}`),
    slug: d.slug || null,
    has_passcode: d.has_passcode,
    theme: d.theme,
    font: d.font || DEFAULT_FONT,
    views: d.views,
    created_at: d.created_at,
    updated_at: d.updated_at,
  }));
  res.json({ count: docs.length, docs });
});

// Ambil dokumen tunggal (by id ATAU slug) — termasuk konten markdown.
function apiOwnedDoc(req, res) {
  const doc = resolveDoc(req.params.id);
  if (!doc || doc.user_id !== req.apiUser.id) {
    res.status(404).json({ error: 'Dokumen ga ketemu atau bukan punya lo.' });
    return null;
  }
  return doc;
}

app.get('/api/v1/docs/:id', requireApiAuth, (req, res) => {
  const doc = apiOwnedDoc(req, res);
  if (!doc) return;
  res.json({
    doc: {
      id: doc.id,
      title: doc.title || 'Untitled',
      url: baseUrl(req) + (doc.slug ? `/${doc.slug}` : `/d/${doc.id}`),
      slug: doc.slug || null,
      content: doc.content,
      theme: doc.theme,
      font: doc.font || DEFAULT_FONT,
      has_passcode: !!doc.passcode_enc,
      views: doc.views,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    },
  });
});

// Replace konten dokumen (link tetap sama). by id ATAU slug.
app.put('/api/v1/docs/:id', apiWriteLimiter, requireApiAuth, (req, res) => {
  const doc = apiOwnedDoc(req, res);
  if (!doc) return;

  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  if (!content.trim()) return res.status(400).json({ error: 'Markdown kosong.' });
  if (tooBig(content)) return res.status(413).json({ error: 'Markdown kegedean (maks 200KB).' });

  // theme/font opsional — kalau ga dikirim, pertahanin yang lama.
  const theme = req.body?.theme !== undefined ? resolveTheme(req.body.theme) : doc.theme;
  const font = req.body?.font !== undefined ? resolveFont(req.body.font) : (doc.font || DEFAULT_FONT);

  updateDoc({ id: doc.id, userId: req.apiUser.id, content, theme, font, title: extractTitle(content) });
  const updated = peekDoc(doc.id);
  res.json({
    ok: true,
    id: doc.id,
    url: baseUrl(req) + (doc.slug ? `/${doc.slug}` : `/d/${doc.id}`),
    slug: doc.slug || null,
    title: updated.title || 'Untitled',
    updated_at: updated.updated_at,
  });
});

// Push: bikin dokumen baru via API, langsung dapet link (+ slug/passcode opsional).
app.post('/api/v1/docs', apiWriteLimiter, requireApiAuth, (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  if (!content.trim()) return res.status(400).json({ error: 'Markdown kosong.' });
  if (tooBig(content)) return res.status(413).json({ error: 'Markdown kegedean (maks 200KB).' });

  const theme = resolveTheme(req.body?.theme);
  const font = resolveFont(req.body?.font);
  const passcode = req.body?.passcode ? String(req.body.passcode) : null;

  // Slug opsional — validasi & cek bentrok dulu sebelum bikin.
  let slug = null;
  if (req.body?.slug != null && String(req.body.slug).trim() !== '') {
    const v = validateSlug(req.body.slug);
    if (v.error) return res.status(400).json({ error: v.error });
    if (slugTaken(v.slug, null)) return res.status(409).json({ error: 'Slug itu udah dipakai.' });
    slug = v.slug;
  }

  const id = createDoc({ content, theme, font, title: extractTitle(content), userId: req.apiUser.id, passcode });
  if (slug) setSlug({ id, userId: req.apiUser.id, slug });
  res.status(201).json({
    id,
    url: baseUrl(req) + (slug ? `/${slug}` : `/d/${id}`),
    slug: slug || null,
    has_passcode: !!passcode,
  });
});

// Set / ganti / hapus custom link (by id ATAU slug).
app.put('/api/v1/docs/:id/slug', apiWriteLimiter, requireApiAuth, (req, res) => {
  const doc = apiOwnedDoc(req, res);
  if (!doc) return;
  const raw = req.body?.slug;
  if (raw == null || String(raw).trim() === '') {
    setSlug({ id: doc.id, userId: req.apiUser.id, slug: null });
    return res.json({ ok: true, slug: null, url: baseUrl(req) + `/d/${doc.id}` });
  }
  const v = validateSlug(raw);
  if (v.error) return res.status(400).json({ error: v.error });
  if (slugTaken(v.slug, doc.id)) return res.status(409).json({ error: 'Slug itu udah dipakai.' });
  setSlug({ id: doc.id, userId: req.apiUser.id, slug: v.slug });
  res.json({ ok: true, slug: v.slug, url: baseUrl(req) + `/${v.slug}` });
});

// Hapus dokumen (by id ATAU slug).
app.delete('/api/v1/docs/:id', apiWriteLimiter, requireApiAuth, (req, res) => {
  const doc = apiOwnedDoc(req, res);
  if (!doc) return;
  deleteDoc(doc.id, req.apiUser.id);
  res.json({ ok: true });
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
  const font = resolveFont(req.body?.font);
  if (!content.trim()) return res.status(400).json({ error: 'Markdown kosong.' });
  if (tooBig(content)) return res.status(413).json({ error: 'Markdown kegedean (maks 200KB).' });

  const title = extractTitle(content);
  // Passcode cuma berlaku buat user login (perlu akun buat recovery).
  const passcode = req.user && req.body?.passcode ? String(req.body.passcode) : null;
  const id = createDoc({ content, theme, font, title, userId: req.user?.id || null, passcode });
  res.json({ id, url: `/d/${id}`, owned: !!req.user });
});

// List dokumen milik user.
app.get('/api/docs', requireAuth, (req, res) => {
  const docs = listDocs(req.user.id).map((d) => ({ ...d, url: d.slug ? `/${d.slug}` : `/d/${d.id}` }));
  res.json({ docs });
});

// Ambil 1 dokumen milik user (buat edit). Sertakan status passcode.
app.get('/api/docs/:id', requireAuth, (req, res) => {
  const doc = peekDoc(req.params.id);
  if (!doc || doc.user_id !== req.user.id) return res.status(404).json({ error: 'Ga ketemu.' });
  res.json({
    doc: {
      id: doc.id, slug: doc.slug || null, url: docUrl(doc),
      content: doc.content, theme: doc.theme, font: doc.font || DEFAULT_FONT, title: doc.title,
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
    theme: resolveTheme(req.body?.theme), font: resolveFont(req.body?.font), title: extractTitle(content),
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

// Set / ganti / hapus custom URL (slug) dokumen.
app.put('/api/docs/:id/slug', writeLimiter, requireAuth, (req, res) => {
  const doc = peekDoc(req.params.id);
  if (!doc || doc.user_id !== req.user.id) return res.status(404).json({ error: 'Ga ketemu.' });

  const raw = req.body?.slug;
  // Kosong = hapus slug (balik ke /d/<id>).
  if (raw == null || String(raw).trim() === '') {
    setSlug({ id: doc.id, userId: req.user.id, slug: null });
    return res.json({ ok: true, slug: null, url: `/d/${doc.id}` });
  }
  const v = validateSlug(raw);
  if (v.error) return res.status(400).json({ error: v.error });
  if (slugTaken(v.slug, doc.id)) return res.status(409).json({ error: 'Slug itu udah dipakai.' });

  setSlug({ id: doc.id, userId: req.user.id, slug: v.slug });
  res.json({ ok: true, slug: v.slug, url: `/${v.slug}` });
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
  const doc = resolveDoc(req.params.id); // bisa id atau slug
  if (!doc) return res.status(404).json({ error: 'Ga ketemu.' });
  if (!doc.passcode_enc) return res.json({ ok: true }); // ga ada passcode, ya udah
  if (!passcodeMatches(String(req.body?.passcode || ''), doc.passcode_enc)) {
    return res.status(403).json({ error: 'Passcode salah.' });
  }
  res.cookie(`ul_${doc.id}`, '1', { ...cookieOpts(24 * 60 * 60 * 1000), signed: true });
  res.json({ ok: true, url: docUrl(doc) });
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

// Daftar font dokumen buat dipakai editor.
app.get('/api/fonts', (_req, res) => {
  res.json({
    default: DEFAULT_FONT,
    fonts: Object.fromEntries(
      Object.entries(FONTS).map(([k, v]) => [k, { name: v.name, stack: v.stack }])
    ),
  });
});

// ──────────────────────────── IMAGES ────────────────────────────
// Upload gambar -> R2, balikin URL publik buat disisipin ke markdown.
// Cuma user login (cegah abuse storage). Body = raw bytes gambar.
const imageLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

app.post(
  '/api/images',
  imageLimiter,
  requireAuth,
  express.raw({ type: Object.keys(ALLOWED_IMAGE_TYPES), limit: MAX_IMAGE_BYTES }),
  async (req, res) => {
    if (!r2Configured()) return res.status(503).json({ error: 'Upload gambar belum dikonfigurasi.' });

    const contentType = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES[contentType]) {
      return res.status(415).json({ error: 'Tipe gambar ga didukung (pakai PNG/JPG/GIF/WebP/AVIF).' });
    }
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: 'File kosong.' });
    }

    try {
      const { url } = await uploadImage({ buffer, contentType, userId: req.user.id });
      res.status(201).json({ url });
    } catch (e) {
      res.status(502).json({ error: e.message || 'Upload gagal.' });
    }
  }
);

// Config publik buat frontend (mis. apakah upload gambar nyala).
app.get('/api/config', (req, res) => {
  res.json({ imageUpload: r2Configured() && !!req.user });
});

// ──────────────────────────── VIEW ────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function viewPage({ title, theme, font, contentHtml }) {
  const t = resolveTheme(theme);
  return `<!DOCTYPE html>
<html lang="id" data-theme="${t}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · markdown.hanif.app</title>
<link rel="stylesheet" href="/hljs/${hljsTheme(t)}.min.css">
<link rel="stylesheet" href="/view.css">
<style>${themeVarsCss(t)}
:root{ --font-doc: ${fontStack(font)}; }</style>
</head>
<body>
<main class="doc">
${contentHtml}
</main>
<footer class="doc-footer">
  <a href="/"><svg class="docmark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M6.5 3h7L18 7.5V20a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M13 3v4.5h4.5"/><path d="M8.5 12.5h7M8.5 15.5h7M8.5 18.5h4"/></svg> markdown.hanif.app</a>
</footer>
<script src="/mermaid-run.js" defer></script>
<script src="/copy-code.js" defer></script>
</body>
</html>`;
}

// Apakah requester boleh lihat konten dokumen?
function canView(req, doc) {
  if (!doc.passcode_enc) return true; // publik
  if (req.user && req.user.id === doc.user_id) return true; // owner bypass
  return req.signedCookies?.[`ul_${doc.id}`] === '1'; // udah unlock
}

// Render dokumen (dipakai /d/:id maupun shortcut top-level /:slug).
function serveDoc(req, res, doc) {
  if (!canView(req, doc)) {
    return res.sendFile(path.join(__dirname, 'public', 'unlock.html'));
  }
  bumpView(doc.id);
  const theme = resolveTheme(req.query.theme || doc.theme);
  const font = resolveFont(req.query.font || doc.font);
  res.type('html').send(viewPage({ title: doc.title || 'Untitled', theme, font, contentHtml: renderMarkdown(doc.content) }));
}

// View page by id atau slug.
app.get('/d/:id', (req, res) => {
  const doc = resolveDoc(req.params.id);
  if (!doc) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  serveDoc(req, res, doc);
});

// Raw markdown (hormati passcode gate). Terima id atau slug.
app.get('/raw/:id', (req, res) => {
  const doc = resolveDoc(req.params.id);
  if (!doc) return res.status(404).send('Not found');
  if (!canView(req, doc)) return res.status(401).send('Protected. Unlock via ' + docUrl(doc));
  bumpView(doc.id);
  res.type('text/plain; charset=utf-8').send(doc.content);
});

// Shortcut top-level: markdown.hanif.app/<slug>. Didaftarin PALING AKHIR biar
// ga nge-shadow route lain (semua route & static udah dievaluasi duluan).
app.get('/:slug', (req, res, next) => {
  const slug = req.params.slug;
  if (slug.includes('.')) return next(); // file statis / favicon dll
  const doc = resolveDoc(slug);
  if (!doc) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  serveDoc(req, res, doc);
});

app.listen(PORT, () => {
  console.log(`markdown.hanif.app listening on :${PORT}`);
});
