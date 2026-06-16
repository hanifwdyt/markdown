'use strict';
const $ = (id) => document.getElementById(id);

async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(url, opt);
  let data = {}; try { data = await r.json(); } catch (_) {}
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
let toastTimer = null;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2400);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Link disalin.'); }
  catch (_) { toast('Gagal menyalin.'); }
}

let myDocs = []; // cache dokumen user buat dropdown "tambah"

function renderList(dirs) {
  const list = $('list');
  if (!dirs.length) {
    list.className = '';
    list.innerHTML = `<div class="empty">Belum ada kumpulan. Bikin yang pertama di atas ↑</div>`;
    return;
  }
  list.className = 'doc-list';
  list.innerHTML = '';
  for (const d of dirs) {
    const row = document.createElement('div');
    row.className = 'doc-row';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'stretch';
    const url = location.origin + d.url;
    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div class="doc-main">
          <a class="doc-title" href="${d.url}" target="_blank" rel="noopener">${escapeHtml(d.title || 'Untitled')}</a>
          <span class="count-pill">${d.doc_count} dok</span>
          <div class="doc-meta"><span class="slug-tag">/dir/${escapeHtml(d.slug)}</span></div>
        </div>
        <div class="doc-row-actions">
          <button class="btn ghost sm" data-manage="${d.id}" type="button">Kelola</button>
          <a class="btn ghost sm" href="${d.url}" target="_blank" rel="noopener">View</a>
          <button class="btn ghost sm" data-copy="${url}" type="button">Copy</button>
          <button class="btn danger sm" data-del="${d.id}" type="button">Hapus</button>
        </div>
      </div>
      <div class="panel-slot" id="panel-${d.id}" hidden></div>`;
    list.appendChild(row);
  }
  list.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy)));
  list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => delDir(b.dataset.del)));
  list.querySelectorAll('[data-manage]').forEach((b) => b.addEventListener('click', () => toggleManage(b.dataset.manage)));
}

async function toggleManage(id) {
  const slot = $('panel-' + id);
  if (!slot.hidden) { slot.hidden = true; slot.innerHTML = ''; return; }
  // tutup panel lain
  document.querySelectorAll('.panel-slot').forEach((s) => { s.hidden = true; s.innerHTML = ''; });
  slot.hidden = false;
  slot.innerHTML = '<p class="muted" style="padding:12px;">Memuat…</p>';
  try {
    const dir = await api('GET', `/api/dirs/${id}`);
    renderPanel(slot, dir);
  } catch (e) { slot.innerHTML = `<p class="muted" style="padding:12px;">${escapeHtml(e.message)}</p>`; }
}

function renderPanel(slot, dir) {
  const inDir = new Set(dir.docs.map((d) => d.id));
  const options = myDocs
    .filter((d) => !inDir.has(d.id))
    .map((d) => `<option value="${d.id}">${escapeHtml(d.title || 'Untitled')}</option>`)
    .join('');

  const members = dir.docs.length
    ? dir.docs.map((d) => `
        <div class="member">
          <span class="t">${escapeHtml(d.title || 'Untitled')}${d.has_passcode ? ' 🔒' : ''}</span>
          <button class="btn danger sm" data-remove="${d.id}" type="button">Keluarkan</button>
        </div>`).join('')
    : '<p class="muted" style="font-size:.82rem;">Belum ada dokumen di kumpulan ini.</p>';

  slot.innerHTML = `
    <div class="dir-panel">
      <h3>Isi kumpulan</h3>
      <p class="sub">Dokumen yang ditambahin bakal muncul di <a href="${dir.url}" target="_blank" rel="noopener">/dir/${escapeHtml(dir.slug)}</a>.</p>
      <div class="members">${members}</div>
      <div class="add-row">
        <select id="add-sel-${dir.id}" ${options ? '' : 'disabled'}>
          ${options || '<option>Semua dokumen udah masuk</option>'}
        </select>
        <button class="btn primary sm" data-add="${dir.id}" type="button" ${options ? '' : 'disabled'}>+ Tambah</button>
      </div>
    </div>`;

  slot.querySelectorAll('[data-remove]').forEach((b) =>
    b.addEventListener('click', () => removeDoc(dir.id, b.dataset.remove, slot)));
  const addBtn = slot.querySelector('[data-add]');
  if (addBtn) addBtn.addEventListener('click', () => {
    const sel = $('add-sel-' + dir.id);
    if (sel && sel.value) addDoc(dir.id, sel.value, slot);
  });
}

async function addDoc(dirId, docId, slot) {
  try {
    const r = await api('POST', `/api/dirs/${dirId}/docs`, { docId });
    toast(r.added ? 'Dokumen ditambahkan.' : 'Dokumen udah ada di kumpulan.');
    await refreshPanel(dirId, slot);
    loadDirs(); // update count
  } catch (e) { toast(e.message); }
}

async function removeDoc(dirId, docId, slot) {
  try {
    await api('DELETE', `/api/dirs/${dirId}/docs/${docId}`);
    toast('Dokumen dikeluarkan.');
    await refreshPanel(dirId, slot);
    loadDirs();
  } catch (e) { toast(e.message); }
}

async function refreshPanel(dirId, slot) {
  const dir = await api('GET', `/api/dirs/${dirId}`);
  renderPanel(slot, dir);
}

async function delDir(id) {
  if (!confirm('Hapus kumpulan ini? Dokumennya ga ikut kehapus.')) return;
  try {
    await api('DELETE', `/api/dirs/${id}`);
    toast('Kumpulan dihapus.');
    loadDirs();
  } catch (e) { toast(e.message); }
}

async function loadDirs() {
  try {
    const data = await api('GET', '/api/dirs');
    renderList(data.dirs);
  } catch (e) {
    $('list').className = '';
    $('list').innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`;
  }
}

function renderAccount(user) {
  $('account').innerHTML = `
    <span class="acct-email" title="${user.email}">${user.email}</span>
    <button class="btn ghost" id="logoutBtn" type="button">Logout</button>`;
  $('logoutBtn').addEventListener('click', async () => {
    try { await api('POST', '/api/auth/logout'); } catch (_) {}
    location.href = '/login';
  });
}

$('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const slug = $('slug').value.trim();
  const title = $('title').value.trim();
  const description = $('description').value.trim();
  try {
    await api('POST', '/api/dirs', { slug, title: title || undefined, description: description || undefined });
    toast('Kumpulan dibikin.');
    $('createForm').reset();
    loadDirs();
  } catch (err) { toast(err.message); }
});

(async function init() {
  let user = null;
  try { user = (await api('GET', '/api/auth/me')).user; } catch (_) {}
  if (!user) { location.href = '/login?next=/dirs'; return; }
  renderAccount(user);
  try { myDocs = (await api('GET', '/api/docs')).docs || []; } catch (_) {}
  loadDirs();
})();
