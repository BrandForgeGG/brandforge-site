'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { normalizeTheme, applyTheme, getStoredTheme, setStoredTheme, VALID_THEMES } = require('./theme');

function makeDom() {
  const store = new Map();
  const dataset = {};
  const document = { documentElement: { dataset } };
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return { document, localStorage, dataset };
}

test('three themes, Forge by default, old saved values map forward', () => {
  assert.deepEqual(VALID_THEMES, ['forge', 'crystal', 'mono']);
  assert.equal(normalizeTheme('crystal'), 'crystal');
  assert.equal(normalizeTheme('mono'), 'mono');
  assert.equal(normalizeTheme('original'), 'forge');
  assert.equal(normalizeTheme('light'), 'mono');
  for (const junk of ['dark', 'bogus', '', null, undefined]) assert.equal(normalizeTheme(junk), 'forge');
});

test('applyTheme sets data-theme for Crystal and Mono and removes it for Forge', () => {
  const { document, dataset } = makeDom();
  const orig = globalThis.document;
  globalThis.document = document;
  try {
    applyTheme('crystal');
    assert.equal(dataset.theme, 'crystal');
    applyTheme('mono');
    assert.equal(dataset.theme, 'mono');
    applyTheme('forge');
    assert.equal(dataset.theme, undefined);
  } finally {
    globalThis.document = orig;
  }
});

test('setStoredTheme persists non-default themes and clears the key for Forge', () => {
  const { document, localStorage, dataset } = makeDom();
  const od = globalThis.document;
  const ol = globalThis.localStorage;
  globalThis.document = document;
  globalThis.localStorage = localStorage;
  try {
    assert.equal(setStoredTheme('crystal'), 'crystal');
    assert.equal(localStorage.getItem('brandforge:theme'), 'crystal');
    assert.equal(dataset.theme, 'crystal');
    assert.equal(setStoredTheme('forge'), 'forge');
    assert.equal(localStorage.getItem('brandforge:theme'), null);
    assert.equal(dataset.theme, undefined);
  } finally {
    globalThis.document = od;
    globalThis.localStorage = ol;
  }
});

test('getStoredTheme reads, migrates and survives blocked storage', () => {
  const { localStorage } = makeDom();
  const ol = globalThis.localStorage;
  globalThis.localStorage = localStorage;
  try {
    assert.equal(getStoredTheme(), 'forge');
    localStorage.setItem('brandforge:theme', 'light');
    assert.equal(getStoredTheme(), 'mono');
  } finally {
    globalThis.localStorage = ol;
  }
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
    assert.equal(getStoredTheme(), 'forge');
    assert.equal(setStoredTheme('mono'), 'mono');
  } finally {
    globalThis.localStorage = ol;
  }
});
