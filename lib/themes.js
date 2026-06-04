// Daftar tema yang tersedia. Key dipakai di URL (?theme=) dan di DB.
// Tiap tema cukup variabel CSS, di-inject ke view page + preview.
export const THEMES = {
  light: {
    name: 'Paper',
    vars: {
      '--bg': '#fbfbf9',
      '--fg': '#1b1b1a',
      '--muted': '#57564f',
      '--border': '#e6e4db',
      '--link': '#1b1b1a',
      '--code-bg': '#f3f2ec',
      '--code-fg': '#1b1b1a',
      '--quote-border': '#cfccc1',
      '--quote-fg': '#57564f',
      '--accent': '#1b1b1a',
      '--hl': 'github',
    },
  },
  dark: {
    name: 'Ink',
    vars: {
      '--bg': '#1a1a18',
      '--fg': '#eae8e0',
      '--muted': '#9b988e',
      '--border': '#34332e',
      '--link': '#eae8e0',
      '--code-bg': '#221f1c',
      '--code-fg': '#eae8e0',
      '--quote-border': '#4a473f',
      '--quote-fg': '#9b988e',
      '--accent': '#eae8e0',
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
