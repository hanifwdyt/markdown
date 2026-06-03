// Daftar tema yang tersedia. Key dipakai di URL (?theme=) dan di DB.
// Tiap tema cukup variabel CSS, di-inject ke view page + preview.
export const THEMES = {
  light: {
    name: 'Light',
    vars: {
      '--bg': '#ffffff',
      '--fg': '#1f2328',
      '--muted': '#59636e',
      '--border': '#d1d9e0',
      '--link': '#0969da',
      '--code-bg': '#f6f8fa',
      '--code-fg': '#1f2328',
      '--quote-border': '#d1d9e0',
      '--quote-fg': '#59636e',
      '--accent': '#0969da',
      '--hl': 'github',
    },
  },
  dark: {
    name: 'Dark',
    vars: {
      '--bg': '#0d1117',
      '--fg': '#e6edf3',
      '--muted': '#9198a1',
      '--border': '#30363d',
      '--link': '#4493f8',
      '--code-bg': '#161b22',
      '--code-fg': '#e6edf3',
      '--quote-border': '#30363d',
      '--quote-fg': '#9198a1',
      '--accent': '#4493f8',
      '--hl': 'github-dark',
    },
  },
  sepia: {
    name: 'Sepia',
    vars: {
      '--bg': '#f4ecd8',
      '--fg': '#433422',
      '--muted': '#7a6a52',
      '--border': '#ddd0b8',
      '--link': '#9a5b1f',
      '--code-bg': '#ece2c8',
      '--code-fg': '#433422',
      '--quote-border': '#c9b894',
      '--quote-fg': '#7a6a52',
      '--accent': '#9a5b1f',
      '--hl': 'github',
    },
  },
  dracula: {
    name: 'Dracula',
    vars: {
      '--bg': '#282a36',
      '--fg': '#f8f8f2',
      '--muted': '#9aa0bd',
      '--border': '#44475a',
      '--link': '#8be9fd',
      '--code-bg': '#21222c',
      '--code-fg': '#f8f8f2',
      '--quote-border': '#bd93f9',
      '--quote-fg': '#9aa0bd',
      '--accent': '#bd93f9',
      '--hl': 'github-dark',
    },
  },
  nord: {
    name: 'Nord',
    vars: {
      '--bg': '#2e3440',
      '--fg': '#eceff4',
      '--muted': '#a7b0c0',
      '--border': '#434c5e',
      '--link': '#88c0d0',
      '--code-bg': '#272c36',
      '--code-fg': '#eceff4',
      '--quote-border': '#5e81ac',
      '--quote-fg': '#a7b0c0',
      '--accent': '#88c0d0',
      '--hl': 'github-dark',
    },
  },
};

export const DEFAULT_THEME = 'light';

export function resolveTheme(key) {
  return THEMES[key] ? key : DEFAULT_THEME;
}

// Bikin CSS variabel string buat di-inject ke <style>.
export function themeVarsCss(key) {
  const t = THEMES[resolveTheme(key)];
  const vars = Object.entries(t.vars)
    .filter(([k]) => k !== '--hl')
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `:root{\n${vars}\n}`;
}

export function hljsTheme(key) {
  return THEMES[resolveTheme(key)].vars['--hl'];
}
