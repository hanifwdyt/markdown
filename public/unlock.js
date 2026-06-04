'use strict';
const $ = (id) => document.getElementById(id);

// URL halaman ini = /d/<id> (server serve unlock page di sini).
const id = location.pathname.split('/').filter(Boolean).pop();

$('unlockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const passcode = $('passcode').value;
  const btn = $('submitBtn');
  btn.disabled = true;
  $('err').hidden = true;
  try {
    const r = await fetch(`/api/docs/${id}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Gagal.');
    location.reload(); // cookie unlock udah keset → konten ke-render.
  } catch (err) {
    $('err').textContent = err.message;
    $('err').hidden = false;
    btn.disabled = false;
  }
});
