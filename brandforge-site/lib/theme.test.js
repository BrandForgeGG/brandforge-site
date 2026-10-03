'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  normalizeTheme,
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  VALID_THEMES,
} = require('./theme');

function makeDom() {
  const store = new Map();
  const dataset = {};
  const document = {
    documentElement: {
      dataset,
    },
  };
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return { document, localStorage, store, dataset };
}

test('normalizeTheme accepts the two themes and defaults to light', () => {
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('original'), 'original');
  assert.equal(normalizeTheme('dark'), 'light', 'dark is not a theme; light is the default');
  assert.equal(normalizeTheme('bogus'), 'light');
  assert.equal(normalizeTheme(null), 'light');
  assert.equal(normalizeTheme(undefined), 'light');
  assert.equal(normalizeTheme(''), 'light');
});

test('applyTheme: light removes data-theme, Forge (original) sets it', () => {
  const { document, dataset } = makeDom();
  const origDoc = globalThis.document;
  globalThis.document = document;
  try {
    applyTheme('original');
    assert.equal(dataset.theme, 'original');
    applyTheme('light');
    assert.equal(dataset.theme, undefined, 'light removes the attribute');
  } finally {
    globalThis.document = origDoc;
  }
});

test('setStoredTheme persists the choice and applies it', () => {
  const { document, localStorage, dataset } = makeDom();
  const origDoc = globalThis.document;
  const origLocal = globalThis.localStorage;
  globalThis.document = document;
  globalThis.localStorage = localStorage;
  try {
    assert.equal(setStoredTheme('original'), 'original');
    assert.equal(localStorage.getItem('brandforge:theme'), 'original');
    assert.equal(dataset.theme, 'original');

    assert.equal(setStoredTheme('light'), 'light');
    assert.equal(localStorage.getItem('brandforge:theme'), null, 'light is the default: key removed');
    assert.equal(dataset.theme, undefined);
  } finally {
    globalThis.document = origDoc;
    globalThis.localStorage = origLocal;
  }
});

test('getStoredTheme reads the stored choice', () => {
  const { localStorage } = makeDom();
  const origLocal = globalThis.localStorage;
  globalThis.localStorage = localStorage;
  try {
    assert.equal(getStoredTheme(), 'light');
    localStorage.setItem('brandforge:theme', 'original');
    assert.equal(getStoredTheme(), 'original');
    localStorage.setItem('brandforge:theme', 'bogus');
    assert.equal(getStoredTheme(), 'light');
  } finally {
    globalThis.localStorage = origLocal;
  }
});

test('theme helpers survive blocked storage', () => {
  const origLocal = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  try {
    assert.equal(getStoredTheme(), 'light');
    assert.equal(setStoredTheme('original'), 'original');
  } finally {
    globalThis.localStorage = origLocal;
  }
});

test('the two themes are the closed set the settings UI offers', () => {
  assert.deepEqual(VALID_THEMES, ['light', 'original']);
});
