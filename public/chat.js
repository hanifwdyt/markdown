// Chat AI per-dokumen. Aktif kalau <body data-chat-doc="..."> ada
// (server cuma nge-inject script ini kalau DEEPSEEK_API_KEY keset).
(() => {
  const docId = document.body.dataset.chatDoc;
  if (!docId) return;

  const history = []; // {role, content} — hidup selama page open

  // ── Bangun DOM ──
  const fab = el('button', 'chat-fab');
  fab.type = 'button';
  fab.title = 'Tanya AI soal dokumen ini';
  fab.setAttribute('aria-label', 'Buka chat AI');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  const panel = el('aside', 'chat-panel');
  panel.setAttribute('aria-label', 'Chat AI dokumen');
  panel.innerHTML = `
<div class="chat-head">
  <div class="chat-head-title">Tanya dokumen ini
    <span class="chat-head-sub">${escape(document.title.replace(/ · markdown\.hanif\.app$/, ''))}</span>
  </div>
  <button type="button" class="chat-close" aria-label="Tutup chat">✕</button>
</div>
<div class="chat-msgs">
  <div class="chat-empty">
    <p>Tanya apa aja soal isi dokumen ini.<br>Jawaban dibatasi ke konten dokumen.</p>
    <button type="button" class="chat-suggest">Ringkas dokumen ini dong</button>
    <button type="button" class="chat-suggest">Poin paling penting apa?</button>
  </div>
</div>
<form class="chat-form">
  <textarea class="chat-input" rows="1" maxlength="2000" placeholder="Tulis pertanyaan…" aria-label="Pertanyaan"></textarea>
  <button type="submit" class="chat-send" aria-label="Kirim">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>
  </button>
</form>
<div class="chat-foot">AI bisa salah — cek ke dokumen aslinya.</div>`;

  document.body.append(fab, panel);

  const msgsBox = panel.querySelector('.chat-msgs');
  const form = panel.querySelector('.chat-form');
  const input = panel.querySelector('.chat-input');
  const sendBtn = panel.querySelector('.chat-send');
  let busy = false;

  // ── Open / close ──
  fab.addEventListener('click', () => { document.body.classList.add('chat-open'); input.focus(); });
  panel.querySelector('.chat-close').addEventListener('click', () => document.body.classList.remove('chat-open'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.body.classList.remove('chat-open');
  });

  // Suggestion chips → langsung kirim.
  panel.querySelectorAll('.chat-suggest').forEach((b) =>
    b.addEventListener('click', () => send(b.textContent)));

  // Textarea: auto-grow + Enter kirim (Shift+Enter newline).
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });

  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';
    panel.querySelector('.chat-empty')?.remove();

    history.push({ role: 'user', content: text });
    addMsg('user', text);
    const bubble = addMsg('assistant', '');
    bubble.classList.add('thinking');

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: docId, messages: history }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(r.status === 429
          ? 'Kebanyakan pertanyaan dalam waktu singkat — coba lagi beberapa menit.'
          : err.error || 'Chat lagi gangguan, coba lagi.');
      }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let answer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += dec.decode(value, { stream: true });
        bubble.innerHTML = renderLite(answer);
        scrollBottom();
      }
      if (!answer.trim()) throw new Error('Jawaban kosong, coba lagi.');
      history.push({ role: 'assistant', content: answer });
    } catch (e) {
      history.pop(); // batalin pesan user yang gagal biar bisa dikirim ulang
      bubble.classList.add('error');
      bubble.textContent = e.message || 'Chat gagal.';
    } finally {
      bubble.classList.remove('thinking');
      busy = false;
      sendBtn.disabled = false;
      scrollBottom();
    }
  }

  function addMsg(role, text) {
    const d = el('div', `chat-msg ${role}`);
    d.textContent = text;
    msgsBox.appendChild(d);
    scrollBottom();
    return d;
  }

  function scrollBottom() { msgsBox.scrollTop = msgsBox.scrollHeight; }
  function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
  function escape(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // Markdown ringan buat jawaban AI: bold/italic/code/bullet/heading.
  // Semua HTML di-escape DULU, jadi aman di-innerHTML (ga ada tag mentah lolos).
  function renderLite(text) {
    let h = escape(text);
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|[\s(])\*([^*\s][^*\n]*)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
    h = h.replace(/^#{1,4} (.+)$/gm, '<strong>$1</strong>'); // heading → bold aja
    h = h.replace(/^[-*] /gm, '• '); // bullet list
    h = h.replace(/^(\d+)\. /gm, '$1. ');
    return h;
  }
})();
