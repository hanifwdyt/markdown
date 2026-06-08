// Inject tombol "Copy" ke tiap code block ter-render (<pre><code>).
// Dipakai di view page (auto-run) + preview editor (panggil window.enhanceCodeBlocks).
// Blok mermaid (<pre class="mermaid"> tanpa <code>) sengaja ga kena.
(function () {
  'use strict';

  function attach(code) {
    const pre = code.parentElement;
    if (!pre || pre.dataset.copyReady) return;
    pre.dataset.copyReady = '1';
    pre.classList.add('has-copy');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Salin kode');

    let resetTimer = null;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.innerText.replace(/\n$/, ''));
        btn.textContent = 'Tersalin';
        btn.classList.add('copied');
      } catch (_) {
        btn.textContent = 'Gagal';
      }
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 1500);
    });

    pre.appendChild(btn);
  }

  function enhance(root) {
    (root || document).querySelectorAll('pre > code').forEach(attach);
  }

  window.enhanceCodeBlocks = enhance;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => enhance(document));
  } else {
    enhance(document);
  }
})();
