'use strict';
// Render blok <pre class="mermaid"> jadi diagram. mermaid.js di-load LAZY —
// cuma kalau dokumennya beneran ada blok mermaid (bundle-nya ~3MB).
(function () {
  let loader = null;

  // Map tema dokumen -> tema mermaid.
  const DARK = new Set(['dark', 'dracula', 'nord']);
  function mermaidTheme(themeKey) {
    return DARK.has(themeKey) ? 'dark' : 'default';
  }

  function loadMermaid() {
    if (loader) return loader;
    loader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/mermaid.min.js';
      s.onload = () => (window.mermaid ? resolve(window.mermaid) : reject(new Error('mermaid gagal load')));
      s.onerror = () => reject(new Error('mermaid gagal load'));
      document.head.appendChild(s);
    });
    return loader;
  }

  // Render semua blok mermaid yang belum diproses di dalam `root`.
  async function render(root, themeKey) {
    const scope = root || document;
    const blocks = scope.querySelectorAll('pre.mermaid:not([data-processed])');
    if (!blocks.length) return;

    const theme = themeKey || document.documentElement.getAttribute('data-theme') || 'light';
    let mermaid;
    try {
      mermaid = await loadMermaid();
    } catch (e) {
      blocks.forEach((b) => (b.dataset.processed = 'error'));
      return;
    }
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: mermaidTheme(theme) });
    try {
      await mermaid.run({ nodes: blocks });
    } catch (e) {
      // mermaid nandain error per-blok sendiri; biarin sisanya jalan.
    }
  }

  window.renderMermaid = render;

  // Auto-run di view page (server-rendered).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => render());
  } else {
    render();
  }
})();
