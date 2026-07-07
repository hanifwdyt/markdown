// Daftar Isi otomatis + anchor link di heading. Client-side enhancer
// (pola sama kayak copy-code.js) — jalan di view page.
(() => {
  const doc = document.querySelector('main.doc');
  if (!doc) return;

  // ── Anchor hover di h2-h6 (h1 = judul, skip) ──
  doc.querySelectorAll('h2[id], h3[id], h4[id], h5[id], h6[id]').forEach((h) => {
    const a = document.createElement('a');
    a.className = 'h-anchor';
    a.href = `#${h.id}`;
    a.textContent = '#';
    a.setAttribute('aria-label', 'Link ke bagian ini');
    h.appendChild(a);
  });

  // ── TOC dari h2 + h3 (minimal 3 entri biar ga norak di doc pendek) ──
  const heads = [...doc.querySelectorAll('h2[id], h3[id]')];
  if (heads.length < 3) return;

  const nav = document.createElement('nav');
  nav.className = 'doc-toc';
  nav.setAttribute('aria-label', 'Daftar isi');

  const details = document.createElement('details');
  // Desktop kebuka, mobile ketutup biar ga makan layar
  details.open = window.matchMedia('(min-width: 700px)').matches;

  const summary = document.createElement('summary');
  summary.textContent = 'Daftar Isi';
  details.appendChild(summary);

  const ol = document.createElement('ol');
  heads.forEach((h) => {
    const li = document.createElement('li');
    li.className = h.tagName === 'H3' ? 'toc-sub' : 'toc-top';
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    // teks heading tanpa anchor '#' yang barusan ditambah
    a.textContent = h.textContent.replace(/#$/, '').trim();
    li.appendChild(a);
    ol.appendChild(li);
  });
  details.appendChild(ol);
  nav.appendChild(details);

  // Taro setelah h1 pertama kalau ada, kalau ga ada di paling atas.
  const h1 = doc.querySelector('h1');
  if (h1) h1.after(nav);
  else doc.prepend(nav);
})();
