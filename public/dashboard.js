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

function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (_) { return ''; }
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

function toastAction(msg, label, onAction, ms = 6000) {
  const el = $('toast');
  el.textContent = '';
  const span = document.createElement('span');
  span.textContent = msg;
  const btn = document.createElement('button');
  btn.className = 'toast-undo';
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', () => { el.hidden = true; onAction(); });
  el.append(span, btn);
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Link disalin.'); }
  catch (_) { toast('Gagal menyalin.'); }
}

function renderList(docs) {
  const list = $('list');
  if (!docs.length) {
    list.className = '';
    list.innerHTML = `<div class="empty">Belum ada dokumen. <a href="/">Bikin yang pertama →</a></div>`;
    return;
  }
  list.className = 'doc-list';
  list.innerHTML = '';
  for (const d of docs) {
    const row = document.createElement('div');
    row.className = 'doc-row';
    const url = location.origin + (d.url || '/d/' + d.id);
    const slugTag = d.slug ? `<span class="slug-tag" title="Custom URL">/${escapeHtml(d.slug)}</span>` : '';
    row.innerHTML = `
      <div class="doc-main">
        <a class="doc-title" href="/?id=${d.id}">${escapeHtml(d.title || 'Untitled')} ${d.has_passcode ? '<span class="lock" title="Ada passcode">🔒</span>' : ''}</a>
        <div class="doc-meta">${slugTag}${d.views} views · diubah ${fmtDate(d.updated_at)}</div>
      </div>
      <div class="doc-row-actions">
        <a class="btn ghost sm" href="/?id=${d.id}">Edit</a>
        <a class="btn ghost sm" href="${url}" target="_blank" rel="noopener">View</a>
        <button class="btn ghost sm" data-copy="${url}" type="button">Copy</button>
        <button class="btn danger sm" data-del="${d.id}" type="button">Hapus</button>
      </div>`;
    list.appendChild(row);
  }
  list.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy)));
  list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => del(b.dataset.del, b.closest('.doc-row'))));
}

// Hapus = langsung ilang + bisa di-Urungkan beberapa detik; DELETE ke server
// baru jalan setelah jendela undo lewat. Nol dialog "Are you sure?".
let pendingDel = null; // { id, row, timer }

function commitPendingDelete() {
  if (!pendingDel) return;
  const { id, timer } = pendingDel;
  clearTimeout(timer);
  pendingDel = null;
  fetch(`/api/docs/${id}`, { method: 'DELETE', keepalive: true }).catch(() => load());
}

function del(id, row) {
  commitPendingDelete(); // maksimal satu pending; yang lama di-commit dulu
  row.hidden = true;
  pendingDel = { id, row, timer: setTimeout(commitPendingDelete, 6000) };
  toastAction('Dokumen dihapus.', 'Urungkan', () => {
    if (!pendingDel) return;
    clearTimeout(pendingDel.timer);
    pendingDel.row.hidden = false;
    pendingDel = null;
  });
}

// Tab ditutup sebelum jendela undo lewat → commit lewat fetch keepalive.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') commitPendingDelete();
});

async function load() {
  try {
    const data = await api('GET', '/api/docs');
    renderList(data.docs);
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

(async function init() {
  let user = null;
  try { user = (await api('GET', '/api/auth/me')).user; } catch (_) {}
  if (!user) { location.href = '/login?next=/app'; return; }
  renderAccount(user);
  load();
})();
