'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readSite, brandColors, pictures, contrast } = require('./site-capture.js');
const { buildLaunchPrompt, normalizeLaunch, launchText } = require('./launch-video.js');

const PAGE = `<!doctype html><html><head>
<title>Acme Bakery | Fresh bread daily</title>
<meta name="description" content="Order fresh bread &amp; pastries online.">
<meta property="og:site_name" content="Acme Bakery">
<meta property="og:image" content="/og.jpg">
<meta name="theme-color" content="#E85D04">
<style>body{background:#111;color:#fafafa} .btn{background:#e85d04} a{color:#e85d04}</style>
</head><body>
<h1>Bread, <b>baked</b> this morning</h1><h2>Order by 9</h2><h2>Order by 9</h2><h3>Pick up at noon</h3>
<img src="/favicon.png"><img src="/hero.jpg" alt="Our counter" width="1200"><img src="/tiny.jpg" width="40">
<img src="/_next/image?url=%2Fwork%2Fshop.jpg&w=640&q=75" alt="Shop">
<script>var x = "#000000";</script>
</body></html>`;

test('readSite pulls the name, promise, headings and pictures', () => {
  const site = readSite(PAGE, 'https://www.acme.test/');
  assert.equal(site.name, 'Acme Bakery');
  assert.equal(site.host, 'acme.test');
  assert.equal(site.description, 'Order fresh bread & pastries online.');
  assert.deepEqual(site.headings, ['Bread, baked this morning', 'Order by 9', 'Pick up at noon']);
  assert.deepEqual(site.pictures.map((p) => p.url), ['https://www.acme.test/og.jpg', 'https://www.acme.test/hero.jpg', 'https://www.acme.test/work/shop.jpg']);
  assert.ok(!site.text.includes('#000000'), 'scripts are not page text');
});

test('brand colours keep the theme colour as accent and stay readable', () => {
  const colors = brandColors(PAGE);
  assert.equal(colors.accent, '#e85d04');
  assert.equal(colors.dark, true);
  assert.ok(contrast(colors.text, colors.bg) >= 7);
  assert.ok(contrast(colors.accent, colors.bg) >= 3);
});

test('a page with no colours falls back to readable BrandForge colours', () => {
  const colors = brandColors('<html><body>hi</body></html>');
  assert.deepEqual(colors, { bg: '#0f0e0d', text: '#f4f1ec', accent: '#ff6a2b', dark: true });
});

test('a clearly light page gets a light ground', () => {
  const colors = brandColors('<style>body{background:#ffffff;color:#222222} .a{color:#fafafa} .b{color:#f5f5f5} .c{color:#1d4ed8}</style>');
  assert.equal(colors.dark, false);
  assert.ok(contrast(colors.text, colors.bg) >= 7);
  assert.equal(colors.accent, '#1d4ed8');
});

test('a colour the stylesheet names as the brand wins over colours that only appear often', () => {
  const css = ':root{--background:#0f0e0d;--ember:#ff6a2b} .tg{color:#229ed9} .tg2{color:#229ed9} .tg3{color:#229ed9}';
  const colors = brandColors('<html></html>', css);
  assert.equal(colors.accent, '#ff6a2b');
  assert.equal(colors.bg, '#0f0e0d');
});

test('feature items given as plain strings still count', () => {
  const result = normalizeLaunch({ hook: { heading: 'Hello there' }, features: { heading: 'What', items: ['One', 'Two', 'Three'] }, cta: {} }, { name: 'A', hasSite: false, hasPictures: false });
  assert.deepEqual(result.ok && result.scenes[1].items.map((i) => i.title), ['One', 'Two', 'Three']);
});

test('picture labels drop screenshot-of wording', () => {
  const list = pictures('<img src="/w.jpg" width="900" alt="Screenshot of Grindnode, saas built by the team">', 'https://x.test/');
  assert.equal(list[0].label, 'Grindnode');
});

test('pictures skip icons, logos and data urls', () => {
  const list = pictures('<img src="/logo.png" width="800"><img src="data:image/png;base64,AA"><img src="/a.svg"><img src="https://cdn.x/p.webp">', 'https://x.test/');
  assert.deepEqual(list.map((p) => p.url), ['https://cdn.x/p.webp']);
});

const ANSWER = {
  hook: { heading: 'Bread, baked this morning', accent: 'baked', sub: 'Order online, pick up at noon.', voice: 'Fresh bread, baked this morning by Acme Bakery.' },
  problem: { heading: 'No more early queues', chips: ['Queues', 'Sold out', 'Phone orders'], voice: 'No more queues or sold out shelves.' },
  tour: { heading: 'Order in a minute', voice: 'Pick your loaf on the site.' },
  features: { heading: 'What you get', items: [{ title: 'Order online', note: 'Before 9' }, { title: 'Pick up', note: 'At noon' }, { title: 'Pastries', note: '' }], voice: 'Order online and pick up at noon.' },
  steps: { heading: 'How it works', items: [{ title: 'Choose' }, { title: 'Pay' }, { title: 'Collect' }], voice: 'Choose, pay, collect.' },
  proof: { heading: 'From our counter', voice: 'This is our counter.' },
  cta: { line: 'Your bread is waiting.', button: 'Order now', voice: 'Order now at Acme Bakery.' },
};

test('normalizeLaunch keeps the story order and times every scene', () => {
  const result = normalizeLaunch(JSON.stringify(ANSWER), { name: 'Acme Bakery', hasSite: true, hasPictures: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.scenes.map((s) => s.kind), ['hook', 'problem', 'tour', 'features', 'steps', 'proof', 'cta']);
  assert.equal(result.scenes[0].accent, 'baked');
  assert.ok(result.scenes.every((s) => s.seconds >= 2.6 && s.voice));
});

test('normalizeLaunch leaves out what it cannot show', () => {
  const result = normalizeLaunch({ ...ANSWER, problem: { heading: 'x', chips: ['one'] }, steps: { heading: 'h', items: [{ title: 'a' }] } }, { name: 'A', hasSite: false, hasPictures: false });
  assert.equal(result.ok, true);
  assert.deepEqual(result.scenes.map((s) => s.kind), ['hook', 'features', 'cta']);
});

test('normalizeLaunch drops an accent word that is not in the hook and rejects a missing hook', () => {
  const result = normalizeLaunch({ ...ANSWER, hook: { ...ANSWER.hook, accent: 'cake' } }, { name: 'A', hasSite: true, hasPictures: true });
  assert.equal(result.ok && result.scenes[0].accent, '');
  assert.equal(normalizeLaunch('{"cta":{}}', { name: 'A', hasSite: true, hasPictures: true }).ok, false);
  assert.equal(normalizeLaunch('not json', { name: 'A', hasSite: true, hasPictures: true }).ok, false);
});

test('the prompt carries the page and the honesty rule, and turns scenes off when there is nothing to show', () => {
  const site = readSite(PAGE, 'https://acme.test/');
  const withSite = buildLaunchPrompt({ site, about: '', hasPictures: true });
  assert.match(withSite.user, /Acme Bakery/);
  assert.match(withSite.system, /Never invent numbers/);
  const without = buildLaunchPrompt({ site: null, about: 'A bakery app', hasPictures: false });
  assert.match(without.system, /Set tour to null/);
  assert.match(without.system, /Set proof to null/);
});

test('launchText gathers every word for the content check', () => {
  const result = normalizeLaunch(ANSWER, { name: 'A', hasSite: true, hasPictures: true });
  const text = launchText(result.scenes);
  assert.match(text, /Phone orders/);
  assert.match(text, /Collect/);
  assert.match(text, /Order now/);
});
