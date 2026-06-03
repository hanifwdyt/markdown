// Render markdown -> sanitized HTML. Dipakai server-side biar view page
// ga gampang di-XSS dari konten markdown orang lain.
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const marked = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  })
);

marked.setOptions({
  gfm: true,
  breaks: false,
});

// Slug buat anchor heading (biar link #heading jalan).
function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function renderMarkdown(md) {
  const source = typeof md === 'string' ? md : '';

  // Heading dikasih id buat anchor link.
  const renderer = {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const raw = tokens.map((t) => t.raw).join('');
      const id = slugify(raw);
      return `<h${depth} id="${id}">${text}</h${depth}>\n`;
    },
  };
  marked.use({ renderer });

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
