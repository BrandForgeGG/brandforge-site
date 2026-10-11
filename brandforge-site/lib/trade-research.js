'use strict';

// The Trade listing writer's research step. When someone types a link, a domain or a business, the page is read and
// the listing is written from what it actually says, instead of echoing the person's words. Pure: it finds the links,
// builds the prompt and reads the reply, so node:test can drive it without a model or a network.

const TLDS = 'com|co\\.uk|uk|io|app|dev|net|org|gg|ai|co|me|xyz|studio|agency|shop|store|tech|design|media|online|site|blog|fr|de|es|it|nl|eu|ca|us|au|in|ae|sa';
const URL_PATTERN = new RegExp(`\\bhttps?:\\/\\/[^\\s<>"')]+|\\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${TLDS})\\b(?:\\/[^\\s<>"')]*)?`, 'gi');

/** The pages a person pointed to: up to `max` addresses, https first, no duplicates, trailing punctuation removed. */
function extractUrls(text, max = 2) {
  const found = [];
  const seen = new Set();
  const source = String(text || '');
  for (const match of source.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const cleaned = raw.replace(/[.,;:!?]+$/, '');
    // The domain half of an email address is not a page.
    if (match.index > 0 && source[match.index - 1] === '@') continue;
    if (/@/.test(cleaned) || /^\d+(\.\d+)+$/.test(cleaned)) continue;
    const url = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    let host;
    try {
      host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      continue;
    }
    if (seen.has(host)) continue;
    seen.add(host);
    found.push(url.slice(0, 300));
    if (found.length >= max) break;
  }
  return found;
}

const CATEGORY_HINT = 'Design and brand | Video and motion | Copy and content | Ads and growth | Social and community | Web and software | Photography | Strategy and research | Products and tools | Startup and launch | Profile';

const SYSTEM = `You are the listing writer for BrandForge Trade, a marketplace where people offer or request services, products, tools, startups and websites. Your job is to turn what a person typed, plus anything read from their web page, into a listing that makes a stranger understand the offer in five seconds and want to act. Research first, then write.

Return ONLY JSON:
{"kind":"offer"|"request","category":string,"title":string,"description":string,"currency":"EUR"|"USD"|"GBP","budgetMin":number|null,"budgetMax":number|null,"found":[string],"tips":[string]}

How to think:
1. Work out what this really is. A link with "I own this", "my site" or "we do" is the business or person behind it offering their work: list what that business does, as an offer, so the right clients can hire them. Only treat it as a website or business for sale when the person says so (selling, for sale, buy, acquire). If it is unclear, list the services and add a tip: "Say if you are selling the business itself."
2. Pull the specific, checkable facts from the page: what the business does, who it serves, services, products, location, tools or technology, style, anything concrete. Specific beats impressive.
3. Decide who would care, and why, in one sentence.

Rules:
- kind: "offer" when they offer or sell something (including a site or business for sale); "request" when they need something.
- category: exactly one of: ${CATEGORY_HINT}.
- title: at most 80 characters, specific, says what it is and the strongest honest detail (for example "Established creative media agency website, ready to take over"). No hype words, no all-caps, no emoji.
- description: plain text with line breaks, at most 1,000 characters, in this shape:
  Line 1: one sentence hook saying what it is and who it is for.
  A blank line, then "What you get" and 3 to 5 lines that each start with "• ".
  A blank line, then "Good for: " and one line naming the kind of buyer or client.
  Optionally a blank line and "Details: " with concrete facts from the page (what it does, where, how it is built).
- ONLY use facts from the person's words or the page text. Never invent clients, results, revenue, profit, traffic, investment value, years in business, awards, reviews or guarantees. Quote prices, turnaround times and terms exactly as the page states them. If something is unknown, leave it out or put it in tips.
- Prices: use a number only if the person or the page states one. Never guess a price.
- found: up to 5 short plain notes of what you learned and used, for the person to see (for example "Reads as a creative media agency in the UK"). Only things really in the sources.
- tips: up to 3 short, concrete things the person could add to make the listing stronger (a price, one proof point, a sample link). Each at most 14 words.
- Same language as the person's input. Plain, warm, confident. No emoji.`;

/**
 * @param {{ text: string, pages?: { url: string, title?: string, text?: string }[], snippets?: { title: string, snippet?: string, url?: string }[] }} input
 * @returns {{ system: string, user: string }}
 */
function buildListingPrompt({ text, pages = [], snippets = [] }) {
  const lines = ['What the person typed:', String(text || '').slice(0, 1200)];
  pages.forEach((page, index) => {
    lines.push('', `Page ${index + 1}: ${page.url}`, `Title: ${String(page.title || '').slice(0, 200)}`, 'Text read from the page (the facts you may use):', String(page.text || '').replace(/\s+/g, ' ').slice(0, 5000));
  });
  if (snippets.length) {
    lines.push('', 'Web search results about the same business (public, unchecked: use only what agrees with the page):');
    for (const result of snippets.slice(0, 3)) lines.push(`- ${String(result.title || '').slice(0, 120)}: ${String(result.snippet || '').slice(0, 220)}`);
  }
  if (!pages.length) lines.push('', 'No page could be read. Write only from the person\'s words and put what is missing in tips.');
  return { system: SYSTEM, user: lines.join('\n') };
}

function line(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** The short notes shown next to the draft, clamped. -> { found: string[], tips: string[] } */
function normalizeNotes(json) {
  const list = (value, count, max) => (Array.isArray(value) ? value : []).map((item) => line(item, max)).filter(Boolean).slice(0, count);
  return { found: list(json && json.found, 5, 140), tips: list(json && json.tips, 3, 110) };
}

/** True when the written description is rich enough to be worth showing (a hook, a list and some length). */
function isRichDescription(description) {
  const text = String(description || '');
  return text.length >= 160 && /•/.test(text);
}

module.exports = { extractUrls, buildListingPrompt, normalizeNotes, isRichDescription, SYSTEM };
