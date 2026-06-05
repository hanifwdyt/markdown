// Pilihan font dokumen. Key dipakai di URL/DB; stack = font-family CSS.
// Semua system font (no web font → no CSP change). 4 tekstur beda.
export const FONTS = {
  serif: {
    name: 'Serif',
    stack: "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, 'Times New Roman', serif",
  },
  sans: {
    name: 'Sans',
    stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  mono: {
    name: 'Mono',
    stack: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  },
  classic: {
    name: 'Classic',
    stack: "'Times New Roman', Times, 'Liberation Serif', Georgia, serif",
  },
};

export const DEFAULT_FONT = 'serif';

export function resolveFont(key) {
  return FONTS[key] ? key : DEFAULT_FONT;
}

export function fontStack(key) {
  return FONTS[resolveFont(key)].stack;
}
