'use strict';

// Tells Bing, Yandex and other IndexNow search engines which pages changed, right away instead of waiting to be crawled.
// Run after a deploy:  node scripts/indexnow.js            (every URL in the sitemap)
//                      node scripts/indexnow.js /pricing    (just these paths)
// The key is public by design: it is the name of the file in /public that proves we own the site.
const fs = require('node:fs');
const path = require('node:path');

const HOST = 'brandforge.gg';
const keyFile = fs.readdirSync(path.join(__dirname, '..', 'public')).find((name) => /^[0-9a-f]{32}\.txt$/.test(name));
if (!keyFile) throw new Error('No IndexNow key file in public/.');
const key = keyFile.replace(/\.txt$/, '');

async function urls() {
  const given = process.argv.slice(2);
  if (given.length) return given.map((p) => `https://${HOST}${p.startsWith('/') ? p : `/${p}`}`);
  const xml = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

urls().then(async (urlList) => {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList }),
  });
  console.log(`IndexNow: ${urlList.length} URLs, answer ${res.status}`);
});
