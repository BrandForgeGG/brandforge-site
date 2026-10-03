'use strict';

// Theme persistence for the two BrandForge themes: light (default) and the dark
// "Forge" theme (stored as 'original'). The choice lives in localStorage so it
// survives reloads and applies before paint via the inline script in app/layout.tsx.
// Light is the absence of data-theme: the CSS default. Forge sets data-theme='original'.

const THEME_KEY = 'brandforge:theme';
const VALID_THEMES = ['light', 'original'];

function normalizeTheme(value) {
  return VALID_THEMES.includes(value) ? value : 'light';
}

function applyTheme(theme) {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root) return;
  const normalized = normalizeTheme(theme);
  if (normalized === 'original') {
    root.dataset.theme = normalized;
  } else {
    delete root.dataset.theme;
  }
}

function getStoredTheme() {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'light';
  }
}

function setStoredTheme(theme) {
  const normalized = normalizeTheme(theme);
  try {
    if (normalized === 'light') {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, normalized);
    }
  } catch {
    // Storage blocked — the choice just won't persist.
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
