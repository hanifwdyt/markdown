import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { renderMarkdown, extractTitle } from './lib/render.js';
import { resolveTheme, themeVarsCss, hljsTheme, THEMES, DEFAULT_THEME } from './lib/themes.js';
import { createDoc, getDoc } from './lib/store.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BYTES = 200 * 1024; // batas ukuran markdown per dokumen

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

// Static: app shell + highlight.js themes.
app.use(express.static(path.join(__dirname, 'public')));
app.use('/hljs', express.static(path.dirname(require.resolve('highlight.js/styles/github.css'))));

app.get('/livez', (_req, res) => res.send('ok'));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// API: simpan dokumen, balikin short id.
const writeLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

app.post('/api/docs', writeLimiter, (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  const theme = resolveTheme(req.body?.theme);

  if (!content.trim()) return res.status(400).json({ error: 'Markdown kosong.' });
  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) {
    return res.status(413).json({ error: 'Markdown kegedean (maks 200KB).' });
  }

  const title = extractTitle(content);
  const id = createDoc({ content, theme, title });
  res.json({ id, url: `/d/${id}` });
});

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

// View page: render dokumen server-side dengan tema.
app.get('/d/:id', (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));

  const theme = resolveTheme(req.query.theme || doc.theme);
  const contentHtml = renderMarkdown(doc.content);
  res
    .type('html')
    .send(viewPage({ title: doc.title || 'Untitled', theme, contentHtml }));
});

// Raw markdown.
app.get('/raw/:id', (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc) return res.status(404).send('Not found');
  res.type('text/plain; charset=utf-8').send(doc.content);
});

// Preview live buat editor — render sama persis kayak view page.
const previewLimiter = rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false });
app.post('/api/preview', previewLimiter, (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) {
    return res.status(413).json({ error: 'Markdown kegedean (maks 200KB).' });
  }
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

app.listen(PORT, () => {
  console.log(`markdown.hanif.app listening on :${PORT}`);
});
