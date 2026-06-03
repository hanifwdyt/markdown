'use strict';

const $ = (id) => document.getElementById(id);
const editor = $('editor');
const preview = $('preview');
const previewWrap = $('previewWrap');
const themeSel = $('theme');

let THEMES = {};
let currentTheme = 'light';

const SAMPLE = `# Halo 👋

Ini **markdown.hanif.app** — render markdown, pilih tema, lalu bagikan lewat link.

## Fitur
- Live preview di kanan
- Beberapa tema (coba dropdown di atas)
- Syntax highlighting

\`\`\`js
function hello(name) {
  return \`Halo, \${name}!\`;
}
\`\`\`

> Klik **Share →** buat dapetin link pendek yang bisa dibagiin.

| Kolom | Nilai |
|-------|-------|
| Cepat | ✅ |
| Simpel | ✅ |
`;

// ---- Themes ----
async function loadThemes() {
  const r = await fetch('/api/themes');
  const data = await r.json();
  THEMES = data.themes;
  currentTheme = data.default;
  themeSel.innerHTML = '';
  for (const [key, t] of Object.entries(THEMES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = t.name;
    themeSel.appendChild(opt);
  }
  const saved = localStorage.getItem('md.theme');
  if (saved && THEMES[saved]) currentTheme = saved;
  themeSel.value = currentTheme;
  applyTheme(currentTheme);
}

function applyTheme(key) {
  const t = THEMES[key];
  if (!t) return;
  currentTheme = key;
  for (const [k, v] of Object.entries(t.vars)) {
    if (k === '--hl') continue;
    previewWrap.style.setProperty(k, v);
  }
  $('hljs-theme').setAttribute('href', `/hljs/${t.vars['--hl']}.min.css`);
  localStorage.setItem('md.theme', key);
}

// ---- Preview (debounced, server render) ----
let timer = null;
let pending = false;
async function renderPreview() {
  const content = editor.value;
  try {
    const r = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!r.ok) return;
    const data = await r.json();
    preview.innerHTML = data.html;
  } catch (_) {}
  localStorage.setItem('md.content', content);
}
function schedulePreview() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(renderPreview, 280);
}

// ---- Share ----
async function share() {
  const content = editor.value.trim();
  if (!content) return toast('Markdown masih kosong.');
  const btn = $('share');
  btn.disabled = true;
  btn.textContent = 'Nyimpen...';
  try {
    const r = await fetch('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, theme: currentTheme }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Gagal menyimpan.');
    const url = location.origin + data.url;
    $('shareUrl').value = url;
    $('openLink').setAttribute('href', url);
    $('modal').hidden = false;
    $('shareUrl').select();
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Share →';
  }
}

// ---- Helpers ----
async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg || 'Disalin.');
  } catch (_) {
    toast('Gagal menyalin.');
  }
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

// ---- Wire up ----
themeSel.addEventListener('change', () => applyTheme(themeSel.value));
editor.addEventListener('input', schedulePreview);
$('share').addEventListener('click', share);
$('copyMd').addEventListener('click', () => copy(editor.value, 'Markdown disalin.'));
$('copyUrl').addEventListener('click', () => copy($('shareUrl').value, 'Link disalin.'));
$('closeModal').addEventListener('click', () => ($('modal').hidden = true));
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) $('modal').hidden = true;
});

// Tab insert 2 spasi di textarea.
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart, en = editor.selectionEnd;
    editor.value = editor.value.slice(0, s) + '  ' + editor.value.slice(en);
    editor.selectionStart = editor.selectionEnd = s + 2;
    schedulePreview();
  }
});

(async function init() {
  await loadThemes();
  editor.value = localStorage.getItem('md.content') || SAMPLE;
  renderPreview();
})();
