'use strict';
// Render blok <pre class="mermaid"> jadi diagram. mermaid.js di-load LAZY —
// cuma kalau dokumennya beneran ada blok mermaid (bundle-nya ~3MB).
(function () {
  let loader = null;

  // Diagram dibikin monokrom biar nyatu sama desain (ga ada ungu/biru bawaan
  // mermaid). Pakai theme 'base' + themeVariables custom per terang/gelap.
  const DARK = new Set(['dark', 'dracula', 'nord']);
  function mermaidConfig(themeKey) {
    const dark = DARK.has(themeKey);
    const ink = dark ? '#eae8e0' : '#1b1b1a';
    const paper = dark ? '#1a1a18' : '#fbfbf9';
    const fill = dark ? '#26241f' : '#f3f2ec';
    const fontFamily = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
    return {
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily,
      themeVariables: {
        background: paper,
        primaryColor: fill,
        primaryBorderColor: ink,
        primaryTextColor: ink,
        secondaryColor: paper,
        tertiaryColor: paper,
        lineColor: ink,
        textColor: ink,
        mainBkg: fill,
        nodeBorder: ink,
        clusterBkg: paper,
        clusterBorder: ink,
        edgeLabelBackground: paper,
        titleColor: ink,
        fontFamily,
      },
    };
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
    mermaid.initialize(mermaidConfig(theme));
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
