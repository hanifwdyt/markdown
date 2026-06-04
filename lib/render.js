// Render markdown -> sanitized HTML. Dipakai server-side biar view page
// ga gampang di-XSS dari konten markdown orang lain.
//
// Blok ```mermaid ga di-highlight, tapi dikeluarin sebagai <pre class="mermaid">
// berisi teks mentah (di-escape). Diagram-nya di-render di browser oleh
// mermaid.js (lihat public/mermaid-run.js).
import { Marked } from 'marked';
import hljs from 'highlight.js';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Slug buat anchor heading (biar link #heading jalan).
function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const marked = new Marked({ gfm: true, breaks: false });

marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const raw = tokens.map((t) => t.raw).join('');
      const id = slugify(raw);
      return `<h${depth} id="${id}">${text}</h${depth}>\n`;
    },
    code({ text, lang }) {
      const language = (lang || '').trim().split(/\s+/)[0];
      // Mermaid: keluarin teks mentah, render di client.
      if (language === 'mermaid') {
        return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`;
      }
      const lng = hljs.getLanguage(language) ? language : 'plaintext';
      const html = hljs.highlight(text, { language: lng }).value;
      return `<pre><code class="hljs language-${lng}">${html}</code></pre>\n`;
    },
  },
});

export function renderMarkdown(md) {
  const source = typeof md === 'string' ? md : '';
  const rawHtml = marked.parse(source);

  // Sanitize: izinkan atribut umum + target link, blok script/style/iframe.
  const clean = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li',
      'blockquote', 'pre', 'code', 'em', 'strong', 'del', 'hr', 'br',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div',
      'input', 'sup', 'sub', 'kbd', 'details', 'summary',
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'src', 'alt', 'class', 'id', 'align', 'width',
      'height', 'type', 'checked', 'disabled', 'open', 'colspan', 'rowspan',
    ],
    ALLOW_DATA_ATTR: false,
  });

  return clean;
}

// Ambil judul pertama (h1/h2) buat title halaman.
export function extractTitle(md) {
  const m = String(md || '').match(/^#{1,2}\s+(.+)$/m);
  return m ? m[1].trim().slice(0, 120) : 'Untitled';
}
