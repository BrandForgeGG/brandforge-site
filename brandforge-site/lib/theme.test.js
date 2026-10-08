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
  const document = { documentElement: { dataset } };
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return { document, localStorage, store, dataset };
}

test('normalizeTheme accepts the two themes and defaults to Forge', () => {
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('original'), 'original');
  assert.equal(normalizeTheme('dark'), 'original', 'dark is not a stored value; Forge is the default');
  assert.equal(normalizeTheme('bogus'), 'original');
  assert.equal(normalizeTheme(null), 'original');
  assert.equal(normalizeTheme(undefined), 'original');
  assert.equal(normalizeTheme(''), 'original');
});

test("applyTheme: light sets data-theme='light' (what the CSS expects), Forge removes it", () => {
  const { document, dataset } = makeDom();
  const origDoc = globalThis.document;
  globalThis.document = document;
  try {
    applyTheme('light');
    assert.equal(dataset.theme, 'light');
    applyTheme('original');
    assert.equal(dataset.theme, undefined, 'Forge removes the attribute');
  } finally {
    globalThis.document = origDoc;
  }
});

test('setStoredTheme persists light and applies it; Forge clears the key', () => {
  const { document, localStorage, dataset } = makeDom();
  const origDoc = globalThis.document;
  const origLocal = globalThis.localStorage;
  globalThis.document = document;
  globalThis.localStorage = localStorage;
  try {
    assert.equal(setStoredTheme('light'), 'light');
    assert.equal(localStorage.getItem('brandforge:theme'), 'light');
    assert.equal(dataset.theme, 'light');

    assert.equal(setStoredTheme('original'), 'original');
    assert.equal(localStorage.getItem('brandforge:theme'), null, 'Forge is the default: key removed');
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
    assert.equal(getStoredTheme(), 'original');
    localStorage.setItem('brandforge:theme', 'light');
    assert.equal(getStoredTheme(), 'light');
    localStorage.setItem('brandforge:theme', 'bogus');
    assert.equal(getStoredTheme(), 'original');
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
    assert.equal(getStoredTheme(), 'original');
    assert.equal(setStoredTheme('light'), 'light');
  } finally {
    globalThis.localStorage = origLocal;
  }
});

test('the two themes are the closed set the settings UI offers', () => {
  assert.deepEqual(VALID_THEMES, ['original', 'light']);
});
