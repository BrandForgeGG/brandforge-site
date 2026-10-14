'use strict';

// Reading a website for a launch video, the pure part: from a page's HTML, the name, the promise, the headings, the brand
// colours and the pictures worth showing. Nothing here fetches; the route fetches safely (lib/research.js assertSafeUrl)
// and hands the HTML over, so this is tested directly.

function decode(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 31 && code < 0x10ffff ? String.fromCodePoint(code) : ' ';
    });
}

function plain(html, max) {
  return decode(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function meta(html, keys) {
  const tags = String(html).match(/<meta\s[^>]*>/gi) || [];
  for (const key of keys) {
    for (const tag of tags) {
      const name = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag);
      if (!name || name[1].toLowerCase() !== key) continue;
      const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag);
      if (content && content[1].trim()) return decode(content[1]).trim();
    }
  }
  return '';
}

function absolute(raw, base) {
  try {
    const url = new URL(decode(String(raw || '')).trim(), base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** #abc / #aabbcc -> #aabbcc, anything else -> ''. */
function normalizeHex(value) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || '').trim());
  if (!m) return '';
  const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${hex.toLowerCase()}`;
}

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance, 0 (black) .. 1 (white). */
function luminance(hex) {
  const [r, g, b] = rgbOf(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** How colourful a colour is, 0 (grey) .. 1. */
function saturation(hex) {
  const [r, g, b] = rgbOf(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * The brand's colours from the page: the theme colour and the colours its CSS uses most. Returns { bg, text, accent }:
 * a dark or light ground, text that reads on it, and the most used vivid colour as the accent (BrandForge ember when the
 * page has none). Always readable: text keeps at least 7:1 on the ground, the accent at least 3:1.
 */
function brandColors(html, css = '') {
  const counts = new Map();
  const add = (hex, weight) => {
    const h = normalizeHex(hex);
    if (h) counts.set(h, (counts.get(h) || 0) + weight);
  };
  add(meta(html, ['theme-color', 'msapplication-tilecolor']), 25);
  const styles = (String(html).match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).join(' ') + ' ' + (String(html).match(/style\s*=\s*"[^"]*"/gi) || []).join(' ') + ' ' + String(css || '').slice(0, 1_500_000);
  // Colours a site names as its own (--primary, --brand, --accent ...) count far more than colours that merely appear.
  for (const m of styles.matchAll(/--[\w-]*(?:primary|brand|accent|ember|main|cta)[\w-]*\s*:\s*(#[0-9a-f]{3,6})\b/gi)) add(m[1], 20);
  for (const m of styles.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) add(`#${m[1]}`, 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);

  const vivid = ranked.find((hex) => saturation(hex) > 0.45 && luminance(hex) > 0.06 && luminance(hex) < 0.75);
  const darks = ranked.filter((hex) => luminance(hex) < 0.03);
  const lights = ranked.filter((hex) => luminance(hex) > 0.8);
  // The ground follows the page's first plain background colour; with none, a dark ground.
  const named = /--(?:background|bg|color-background|surface)\s*:\s*(#[0-9a-f]{3,6})\b/i.exec(styles);
  const firstBg = (named && normalizeHex(named[1])) || [...styles.matchAll(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,6})\b/gi)].map((m) => normalizeHex(m[1])).find((hex) => hex && saturation(hex) < 0.3);
  const dark = firstBg ? luminance(firstBg) < 0.4 : true;
  let bg = firstBg || (dark ? darks.find((hex) => saturation(hex) < 0.5) || '#0f0e0d' : lights.find((hex) => saturation(hex) < 0.3) || '#f7f5f1');
  const namedText = /--(?:foreground|fg|text|color-text|text-color)\s*:\s*(#[0-9a-f]{3,6})\b/i.exec(styles);
  const neutral = (list) => list.filter((hex) => saturation(hex) < 0.15).concat(list);
  let text = (namedText && normalizeHex(namedText[1]) && contrast(normalizeHex(namedText[1]), bg) >= 7 && normalizeHex(namedText[1])) || (dark ? neutral(lights).find((hex) => contrast(hex, bg) >= 7) || '#f4f1ec' : neutral(darks).find((hex) => contrast(hex, bg) >= 7) || '#141312');
  if (contrast(text, bg) < 7) {
    bg = dark ? '#0f0e0d' : '#f7f5f1';
    text = dark ? '#f4f1ec' : '#141312';
  }
  let accent = vivid || '#ff6a2b';
  if (contrast(accent, bg) < 3) accent = dark ? '#ff6a2b' : '#d4470f';
  return { bg, text, accent, dark };
}

/** Headings in page order (h1 first), cleaned, deduplicated, at most `max`. */
function headings(html, max = 12) {
  const out = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = plain(m[2], 140);
    const key = text.toLowerCase();
    if (text.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

/** Pictures worth showing: the share image first, then large-looking content images (no icons, logos or trackers). */
function pictures(html, base, max = 6) {
  const out = [];
  const push = (raw, label) => {
    const url = absolute(raw, base);
    if (!url || out.some((p) => p.url === url)) return;
    if (/\.(svg|ico)(\?|$)/i.test(url) || /(favicon|sprite|pixel|logo|icon|avatar|badge|tracking|spacer)/i.test(url)) return;
    // Alt text like "Screenshot of Acme, saas built by us" becomes "Acme".
    const tidy = plain(label, 120).replace(/^(screenshot|image|photo|picture|logo) of (the )?/i, '').split(/,| - | \| /)[0].trim().slice(0, 60);
    out.push({ url, label: tidy });
  };
  const og = meta(html, ['og:image:secure_url', 'og:image', 'twitter:image']);
  if (og) push(og, '');
  for (const m of String(html).matchAll(/<img\s[^>]*>/gi)) {
    const tag = m[0];
    const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag) || /\sdata-src\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!src || src[1].startsWith('data:')) continue;
    const width = Number((/\swidth\s*=\s*["']?(\d+)/i.exec(tag) || [])[1] || 0);
    if (width && width < 240) continue;
    const alt = (/\salt\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '';
    // Next.js optimised images carry the real path in ?url=.
    let raw = src[1];
    const nextUrl = /\/_next\/image\?url=([^&]+)/.exec(raw);
    if (nextUrl) raw = decodeURIComponent(nextUrl[1]);
    push(raw, alt);
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

/** Everything the writer needs about a page, from its HTML. */
function readSite(html, url, css = '') {
  const title = plain((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html)) || [])[1], 140);
  const siteName = meta(html, ['og:site_name', 'application-name', 'apple-mobile-web-app-title']);
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }
  const name = (siteName || title.split(/\s[|:\-–—·]\s/)[0] || host).trim().slice(0, 40);
  const description = meta(html, ['description', 'og:description', 'twitter:description']).slice(0, 300);
  const text = plain(String(html).replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, ' '), 3500);
  return { url, host, name, title, description, headings: headings(html), text, colors: brandColors(html, css), pictures: pictures(html, url) };
}

module.exports = { readSite, brandColors, headings, pictures, normalizeHex, luminance, contrast, saturation };
