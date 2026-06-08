'use strict';

const $ = (id) => document.getElementById(id);
const editor = $('editor');
const preview = $('preview');
const previewWrap = $('previewWrap');
const themeSel = $('theme');

let THEMES = {};
let FONTS = {};
let currentTheme = 'light';
let currentFont = 'serif';
const fontSel = $('font');
let me = null;            // user login (atau null)
let docId = null;         // id dokumen kalau lagi edit / udah disave
let docSlug = null;       // custom URL (slug), kalau ada
let docHasPasscode = false;

function canonicalUrl() {
  return location.origin + (docSlug ? '/' + docSlug : '/d/' + docId);
}

const SAMPLE = `# Halo 👋

Ini **markdown.hanif.app** — render markdown, pilih tema, lalu bagikan lewat link.

## Fitur
- Live preview di kanan
- Beberapa tema (coba dropdown di atas)
- Syntax highlighting
- **Login** buat nyimpen semua dokumen + kasih passcode

\`\`\`js
function hello(name) {
  return \`Halo, \${name}!\`;
}
\`\`\`

> Login dulu biar dokumen kesimpen dan bisa diedit kapan aja.

## Flowchart (Mermaid)
\`\`\`mermaid
flowchart LR
  A[Tulis markdown] --> B{Login?}
  B -->|Ya| C[Kesimpen + bisa diedit]
  B -->|Nggak| D[Quick share link]
  C --> E[Kasih passcode 🔒]
\`\`\`

| Kolom | Nilai |
|-------|-------|
| Cepat | ✅ |
| Simpel | ✅ |
`;

// ---- API helper ----
async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const r = await fetch(url, opt);
  let data = {};
  try { data = await r.json(); } catch (_) {}
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

// ---- Themes ----
async function loadThemes() {
  const data = await api('GET', '/api/themes');
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

// ---- Fonts ----
async function loadFonts() {
  const data = await api('GET', '/api/fonts');
  FONTS = data.fonts;
  currentFont = data.default;
  fontSel.innerHTML = '';
  for (const [key, f] of Object.entries(FONTS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = f.name;
    fontSel.appendChild(opt);
  }
  const saved = localStorage.getItem('md.font');
  if (saved && FONTS[saved]) currentFont = saved;
  fontSel.value = currentFont;
  applyFont(currentFont);
}

function applyFont(key) {
  const f = FONTS[key];
  if (!f) return;
  currentFont = key;
  previewWrap.style.setProperty('--font-doc', f.stack);
  localStorage.setItem('md.font', key);
}

// ---- Auth state ----
async function loadMe() {
  try {
    const data = await api('GET', '/api/auth/me');
    me = data.user;
  } catch (_) { me = null; }
  renderAccount();
  // Tombol utama: "Save" kalau login, "Share →" kalau anon.
  $('primaryBtn').textContent = me ? (docId ? 'Save' : 'Save →') : 'Share →';
}

function renderAccount() {
  const el = $('account');
  if (me) {
    el.innerHTML = `
      <a class="acct-link" href="/app">Dokumen gue</a>
      <span class="acct-email" title="${me.email}">${me.email}</span>
      <button class="btn ghost" id="logoutBtn" type="button">Logout</button>`;
    $('logoutBtn').addEventListener('click', logout);
  } else {
    el.innerHTML = `<a class="btn ghost" href="/login">Log in</a>`;
  }
}

async function logout() {
  try { await api('POST', '/api/auth/logout'); } catch (_) {}
  location.reload();
}

// ---- Preview (debounced, server render) ----
let timer = null;
async function renderPreview() {
  try {
    const data = await api('POST', '/api/preview', { content: editor.value });
    preview.innerHTML = data.html;
    if (window.renderMermaid) window.renderMermaid(preview, currentTheme);
    if (window.enhanceCodeBlocks) window.enhanceCodeBlocks(preview);
  } catch (_) {}
  if (!docId) localStorage.setItem('md.content', editor.value);
}

function hasMermaid() {
  return /```\s*mermaid/.test(editor.value);
}
function schedulePreview() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(renderPreview, 280);
}

// ---- Save / Share ----
async function primaryAction() {
  const content = editor.value.trim();
  if (!content) return toast('Markdown masih kosong.');
  const btn = $('primaryBtn');
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'Nyimpen...';
  try {
    let data;
    if (me && docId) {
      data = await api('PUT', `/api/docs/${docId}`, { content, theme: currentTheme, font: currentFont });
    } else {
      data = await api('POST', '/api/docs', { content, theme: currentTheme, font: currentFont });
      if (data.id) {
        docId = data.id;
        if (me) {
          // pindah ke mode edit biar refresh tetep nyambung ke dokumen.
          history.replaceState(null, '', `/?id=${docId}`);
          localStorage.removeItem('md.content');
        }
      }
    }
    openShareModal();
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = me ? (docId ? 'Save' : 'Save →') : old;
  }
}

function openShareModal() {
  const url = canonicalUrl();
  $('modalTitle').textContent = me ? 'Tersimpan & siap dibagikan' : 'Link siap dibagikan';
  $('shareUrl').value = url;
  $('openLink').setAttribute('href', url);
  // Custom URL + passcode box cuma buat dokumen owned.
  const owned = !!(me && docId);
  $('customUrlBox').hidden = !owned;
  $('passcodeBox').hidden = !owned;
  if (owned) {
    $('slugPrefix').textContent = location.host + '/';
    $('slugInput').value = docSlug || '';
    refreshPasscodeUI();
  }
  $('modal').hidden = false;
  $('shareUrl').select();
}

async function saveSlug() {
  const slug = $('slugInput').value.trim();
  try {
    const data = await api('PUT', `/api/docs/${docId}/slug`, { slug });
    docSlug = data.slug;
    $('shareUrl').value = canonicalUrl();
    $('openLink').setAttribute('href', canonicalUrl());
    toast(docSlug ? 'Custom URL disimpan.' : 'Custom URL dihapus.');
  } catch (e) { toast(e.message); }
}

// ---- Passcode management ----
function refreshPasscodeUI() {
  $('pcStatus').textContent = docHasPasscode ? 'aktif 🔒' : 'tidak diset';
  $('pcStatus').className = 'pc-status' + (docHasPasscode ? ' on' : '');
  $('pcInput').value = '';
  $('pcInput').placeholder = docHasPasscode ? 'Passcode baru (ganti)...' : 'Passcode baru...';
  $('pcReveal').hidden = !docHasPasscode;
  $('pcRemove').hidden = !docHasPasscode;
}

async function savePasscode() {
  const passcode = $('pcInput').value.trim();
  if (!passcode) return toast('Isi passcode dulu.');
  try {
    const data = await api('PUT', `/api/docs/${docId}/passcode`, { passcode });
    docHasPasscode = data.has_passcode;
    refreshPasscodeUI();
    toast('Passcode disimpan.');
  } catch (e) { toast(e.message); }
}

async function removePasscode() {
  try {
    await api('PUT', `/api/docs/${docId}/passcode`, { passcode: '' });
    docHasPasscode = false;
    refreshPasscodeUI();
    toast('Passcode dihapus.');
  } catch (e) { toast(e.message); }
}

function openReveal() {
  $('acctPass').value = '';
  $('revealResult').hidden = true;
  $('revealResult').textContent = '';
  $('revealModal').hidden = false;
  $('acctPass').focus();
}

async function submitReveal() {
  const password = $('acctPass').value;
  if (!password) return toast('Masukin password akun.');
  try {
    const data = await api('POST', `/api/docs/${docId}/reveal-passcode`, { password });
    const box = $('revealResult');
    box.hidden = false;
    box.innerHTML = `Passcode dokumen ini: <code>${escapeHtml(data.passcode)}</code>`;
  } catch (e) { toast(e.message); }
}

// ---- Load existing doc (edit mode) ----
async function loadExisting(id) {
  const data = await api('GET', `/api/docs/${id}`);
  const doc = data.doc;
  editor.value = doc.content;
  docId = doc.id;
  docSlug = doc.slug || null;
  docHasPasscode = doc.has_passcode;
  if (doc.theme && THEMES[doc.theme]) { currentTheme = doc.theme; themeSel.value = doc.theme; applyTheme(doc.theme); }
  if (doc.font && FONTS[doc.font]) { currentFont = doc.font; fontSel.value = doc.font; applyFont(doc.font); }
}

// ---- Helpers ----
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg || 'Disalin.'); }
  catch (_) { toast('Gagal menyalin.'); }
}
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2400);
}

// ---- Image upload (R2) ----
let canUploadImage = false;

async function loadConfig() {
  try {
    const data = await api('GET', '/api/config');
    canUploadImage = !!data.imageUpload;
  } catch (_) { canUploadImage = false; }
  $('imgBtn').hidden = !canUploadImage;
}

const ALLOWED_IMG = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];

// Sisipin teks di posisi cursor editor. Balikin posisi akhir sisipan.
function insertAtCursor(text) {
  const s = editor.selectionStart, e = editor.selectionEnd;
  editor.value = editor.value.slice(0, s) + text + editor.value.slice(e);
  const end = s + text.length;
  editor.selectionStart = editor.selectionEnd = end;
  editor.focus();
  schedulePreview();
  return { start: s, end };
}

// Ganti placeholder upload dgn hasil (URL final atau hapus kalau gagal).
function replaceInEditor(token, replacement) {
  const i = editor.value.indexOf(token);
  if (i === -1) return;
  editor.value = editor.value.slice(0, i) + replacement + editor.value.slice(i + token.length);
  schedulePreview();
}

let uploadSeq = 0;
async function uploadImageFile(file) {
  if (!canUploadImage) return toast('Login dulu buat upload gambar.');
  if (!ALLOWED_IMG.includes(file.type)) return toast('Tipe gambar ga didukung (PNG/JPG/GIF/WebP/AVIF).');
  if (file.size > 10 * 1024 * 1024) return toast('Gambar kegedean (maks 10MB).');

  const alt = (file.name || 'gambar').replace(/\.[^.]+$/, '').slice(0, 60);
  const token = `![${alt}](uploading-${++uploadSeq}…)`;
  insertAtCursor(token);
  toast('Upload gambar…');

  try {
    const r = await fetch('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    replaceInEditor(token, `![${alt}](${data.url})`);
    toast('Gambar ke-upload.');
  } catch (e) {
    replaceInEditor(token, '');
    toast(e.message || 'Upload gagal.');
  }
}

async function uploadImages(files) {
  for (const f of files) {
    if (f && f.type && f.type.startsWith('image/')) await uploadImageFile(f);
  }
}

// Paste gambar dari clipboard.
editor.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const imgs = [...items].filter((it) => it.kind === 'file' && it.type.startsWith('image/'));
  if (!imgs.length) return;
  e.preventDefault();
  uploadImages(imgs.map((it) => it.getAsFile()).filter(Boolean));
});

// Drag & drop gambar ke editor.
editor.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); editor.classList.add('drag-over'); }
});
editor.addEventListener('dragleave', () => editor.classList.remove('drag-over'));
editor.addEventListener('drop', (e) => {
  const files = e.dataTransfer?.files;
  if (!files || !files.length) return;
  e.preventDefault();
  editor.classList.remove('drag-over');
  uploadImages([...files]);
});

// Tombol toolbar -> file picker.
$('imgBtn').addEventListener('click', () => $('imgInput').click());
$('imgInput').addEventListener('change', (e) => {
  uploadImages([...e.target.files]);
  e.target.value = '';
});

// ---- Wire up ----
themeSel.addEventListener('change', () => {
  applyTheme(themeSel.value);
  // Mermaid ga ikut re-color otomatis; render ulang preview biar nyocokin tema.
  if (hasMermaid()) renderPreview();
});
fontSel.addEventListener('change', () => applyFont(fontSel.value));
editor.addEventListener('input', schedulePreview);
$('primaryBtn').addEventListener('click', primaryAction);
$('copyMd').addEventListener('click', () => copy(editor.value, 'Markdown disalin.'));
$('copyUrl').addEventListener('click', () => copy($('shareUrl').value, 'Link disalin.'));
$('closeModal').addEventListener('click', () => ($('modal').hidden = true));
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').hidden = true; });
$('slugSave').addEventListener('click', saveSlug);
$('slugInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveSlug(); });
$('pcSave').addEventListener('click', savePasscode);
$('pcRemove').addEventListener('click', removePasscode);
$('pcReveal').addEventListener('click', openReveal);
$('closeReveal').addEventListener('click', () => ($('revealModal').hidden = true));
$('revealModal').addEventListener('click', (e) => { if (e.target === $('revealModal')) $('revealModal').hidden = true; });
$('revealSubmit').addEventListener('click', submitReveal);
$('acctPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitReveal(); });

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
  await loadFonts();
  await loadMe();
  await loadConfig();
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (id && me) {
    try {
      await loadExisting(id);
      $('primaryBtn').textContent = 'Save';
    } catch (_) {
      toast('Dokumen ga ketemu atau bukan punya lo.');
      editor.value = localStorage.getItem('md.content') || SAMPLE;
    }
  } else {
    editor.value = localStorage.getItem('md.content') || SAMPLE;
  }
  renderPreview();
})();
