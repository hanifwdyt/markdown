'use strict';
const $ = (id) => document.getElementById(id);
let mode = 'login'; // 'login' | 'register'

function setMode(m) {
  mode = m;
  $('tabLogin').classList.toggle('active', m === 'login');
  $('tabRegister').classList.toggle('active', m === 'register');
  $('submitBtn').textContent = m === 'login' ? 'Login' : 'Daftar';
  $('password').setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
  $('hint').hidden = m === 'login';
  $('err').hidden = true;
}

$('tabLogin').addEventListener('click', () => setMode('login'));
$('tabRegister').addEventListener('click', () => setMode('register'));

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim();
  const password = $('password').value;
  const btn = $('submitBtn');
  btn.disabled = true;
  $('err').hidden = true;
  try {
    const r = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Gagal.');
    // Setelah sukses, balik ke editor.
    const next = new URLSearchParams(location.search).get('next');
    location.href = next || '/app';
  } catch (err) {
    $('err').textContent = err.message;
    $('err').hidden = false;
  } finally {
    btn.disabled = false;
  }
});

// Kalau udah login, langsung ke dashboard.
(async function () {
  try {
    const r = await fetch('/api/auth/me');
    const d = await r.json();
    if (d.user) location.href = '/app';
  } catch (_) {}
})();
