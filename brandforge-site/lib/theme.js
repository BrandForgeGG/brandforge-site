'use strict';

// Theme persistence for the three BrandForge themes: Forge (fire orange, the default), Crystal
// (crystal blue) and Mono (black and white). The choice lives in localStorage and applies before
// paint via the inline script in app/layout.tsx. Forge is the absence of data-theme.
// Older saved values map forward: 'original' -> forge, 'light' -> mono.

const THEME_KEY = 'brandforge:theme';
const VALID_THEMES = ['forge', 'crystal', 'mono'];
const LEGACY = { original: 'forge', light: 'mono' };

function normalizeTheme(value) {
  const mapped = LEGACY[value] || value;
  return VALID_THEMES.includes(mapped) ? mapped : 'forge';
}

function applyTheme(theme) {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root) return;
  const normalized = normalizeTheme(theme);
  if (normalized === 'forge') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = normalized;
  }
}

function getStoredTheme() {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'forge';
  }
}

function setStoredTheme(theme) {
  const normalized = normalizeTheme(theme);
  try {
    if (normalized === 'forge') {
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
