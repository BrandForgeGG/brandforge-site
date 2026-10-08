'use strict';

// Theme persistence for the two BrandForge themes: Forge (the default dark look, stored as
// 'original') and light. The choice lives in localStorage so it survives reloads and applies
// before paint via the inline script in app/layout.tsx. Forge is the absence of data-theme:
// the CSS default. Light sets data-theme='light'.

const THEME_KEY = 'brandforge:theme';
const VALID_THEMES = ['original', 'light'];

function normalizeTheme(value) {
  return VALID_THEMES.includes(value) ? value : 'original';
}

function applyTheme(theme) {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root) return;
  const normalized = normalizeTheme(theme);
  if (normalized === 'light') {
    root.dataset.theme = 'light';
  } else {
    delete root.dataset.theme;
  }
}

function getStoredTheme() {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'original';
  }
}

function setStoredTheme(theme) {
  const normalized = normalizeTheme(theme);
  try {
    if (normalized === 'original') {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, normalized);
    }
  } catch {
    // Storage blocked: the choice just won't persist.
  }
  applyTheme(normalized);
  return normalized;
}

module.exports = {
  THEME_KEY,
  VALID_THEMES,
  normalizeTheme,
  applyTheme,
  getStoredTheme,
  setStoredTheme,
};
