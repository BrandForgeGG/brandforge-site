'use strict';

// Research provider adapter, SSRF-safe page fetch, query planning and the
// per-run research orchestrator (master brief 4.5: plan queries -> search and
// fetch -> synthesize with evidence pointers; section 14: citations, grounding
// and SSRF protections are this module's acceptance criteria).
//
// Design notes:
// - Provider adapters are env-shaped: SEARCH_PROVIDER (default "serper") and
//   SEARCH_API_KEY. Responses normalize to one result shape
//   {url, title, snippet, position} so the rest of the pipeline never sees a
//   provider-specific payload.
// - Every network call takes an injectable fetch and DNS lookup, so node:test
//   exercises the full contract without touching the network.
// - SSRF rules are default-deny: http/https only, no credentials in the URL,
//   no localhost/metadata hostnames, and every resolved address must be a
//   public IP (private, loopback, link-local, CGNAT, ULA, mapped-v4 all
//   refused). Redirects re-run the whole check on every hop.
// - Budget: runResearch never throws. A failed planner, a dead provider or an
//   exhausted deadline degrades to "fewer pages", never to a broken blueprint.
// - Cache: in-memory TTL keyed by normalized query / canonical URL. Cache hits
//   cost nothing, so cost.searches counts API calls actually made.

const dns = require('node:dns').promises;
const net = require('node:net');

const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const CACHE_MAX_ENTRIES = 200;
const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const PAGE_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_BYTES_DEFAULT = 500 * 1000;
const MAX_REDIRECTS_DEFAULT = 3;

// ---------------------------------------------------------------- cache ----

const cache = new Map();

function cacheGet(key, now = Date.now()) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value, ttlMs, now = Date.now()) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Insertion-ordered Map: evict the oldest entry (expired ones first if any).
    for (const existing of cache.keys()) {
      cache.delete(existing);
      break;
    }
  }
  cache.set(key, { value, expiresAt: now + Math.max(1000, ttlMs) });
}

function clearResearchCache() {
  cache.clear();
}

function normalizeQuery(query) {
  return String(query ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Canonical URL for cache keys and dedupe: parse, drop the fragment, keep the
// query string. Unparseable input returns null (never cached, never fetched).
function canonicalUrl(raw) {
  try {
    const url = new URL(String(raw));
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ SSRF gate ----

// Default-deny IP policy: true only for addresses that are plausibly routable
// public endpoints. IPv4 covers RFC1918/loopback/link-local/CGNAT/multicast/
// reserved; IPv6 allows only global unicast (2000::/3) after unwrapping
// v4-mapped and NAT64 forms.
function isPublicIp(ip) {
  const value = String(ip ?? '').trim();
  if (!value) return false;

  if (net.isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number);
    if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false;
    return true;
  }

  if (net.isIP(value) === 6) {
    const v = value.toLowerCase();
    if (v.startsWith('::ffff:')) {
      const rest = v.slice('::ffff:'.length);
      if (rest.includes('.')) return isPublicIp(rest);
      const parts = rest.split(':');
      if (parts.length === 2) {
        const hi = Number.parseInt(parts[0], 16);
        const lo = Number.parseInt(parts[1], 16);
        if (Number.isFinite(hi) && Number.isFinite(lo)) {
          return isPublicIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
        }
      }
      return false;
    }
    // Global unicast lives in 2000::/3, i.e. textual starts 20/21/22/23.
    return v.startsWith('20') || v.startsWith('21') || v.startsWith('22') || v.startsWith('23');
  }

  return false;
}

function defaultLookup(host) {
  return dns.lookup(host, { all: true, verbatim: true });
}

// Validate a URL and (for hostnames) every address it resolves to. Throws a
// coded Error on anything non-public; resolves to the parsed URL when safe.
async function assertSafeUrl(raw, { lookupImpl = defaultLookup } = {}) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error('research_url_invalid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('research_url_unsafe');
  if (url.username || url.password) throw new Error('research_url_unsafe');

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    throw new Error('research_url_unsafe');
  }

  if (net.isIP(host)) {
    if (!isPublicIp(host)) throw new Error('research_url_unsafe');
    return url;
  }

  let addresses;
  try {
    addresses = await lookupImpl(host);
  } catch {
    throw new Error('research_dns_failed');
  }
  const list = Array.isArray(addresses) ? addresses : [{ address: addresses }];
  if (list.length === 0) throw new Error('research_dns_failed');
  for (const entry of list) {
    if (!isPublicIp(entry && entry.address)) throw new Error('research_url_unsafe');
  }
  return url;
}

// -------------------------------------------------------------- helpers ----

function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      return value >= 32 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
    })
    .replace(/&amp;/g, '&');
}

function extractTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return '';
  return decodeEntities(match[1].replace(/\s+/g, ' ').trim()).slice(0, 200);
}

function extractText(html, maxChars) {
  const cleaned = String(html)
    .replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(cleaned).replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

async function timedFetch(url, init, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')) {
      throw new Error('research_timeout');
    }
    throw new Error('research_network');
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('research_too_large');
  if (!response.body) {
    const text = await response.text();
    if (text.length > maxBytes) throw new Error('research_too_large');
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let received = 0;
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      try {
        await reader.cancel();
      } catch {}
      throw new Error('research_too_large');
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

// --------------------------------------------------------------- search ----

// Provider payloads -> one shape. Unknown providers fall through the serper
// shape so a new adapter is one branch, not a pipeline change.
function normalizeSearchResults(provider, payload) {
  if (provider === 'tavily') {
    const list = Array.isArray(payload && payload.results) ? payload.results : [];
    return list
      .map((item, index) => ({
        url: String((item && item.url) || ''),
        title: String((item && item.title) || ''),
        snippet: String((item && item.content) || '').slice(0, 300),
        position: index + 1,
      }))
      .filter((item) => item.url);
  }
  const list = Array.isArray(payload && payload.organic) ? payload.organic : [];
  return list
    .map((item, index) => ({
      url: String((item && item.link) || ''),
      title: String((item && item.title) || ''),
      snippet: String((item && item.snippet) || '').slice(0, 300),
      position: Number(item && item.position) || index + 1,
    }))
    .filter((item) => item.url);
}

async function searchWeb({
  query,
  num = 5,
  provider = 'serper',
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 4000,
  cacheTtlMs = SEARCH_CACHE_TTL_MS,
  now = Date.now,
}) {
  if (!apiKey) throw new Error('search_disabled');

  const cacheKey = `q:${provider}:${normalizeQuery(query)}`;
  const hit = cacheGet(cacheKey, now());
  if (hit) return { results: hit, cached: true, calls: 0 };

  const endpoint = provider === 'tavily' ? TAVILY_ENDPOINT : SERPER_ENDPOINT;
  const init =
    provider === 'tavily'
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: apiKey, query, max_results: num }),
        }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
          body: JSON.stringify({ q: query, num }),
        };

  const response = await timedFetch(endpoint, init, fetchImpl, timeoutMs);
  if (!response.ok) throw new Error(`search_http_${response.status}`);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('search_bad_response');
  }

  const results = normalizeSearchResults(provider, payload).slice(0, num);
  cacheSet(cacheKey, results, cacheTtlMs, now());
  return { results, cached: false, calls: 1 };
}

// ----------------------------------------------------------- page fetch ----

// Fetch one research page with the full SSRF gate re-applied per redirect
// hop, a byte cap while streaming, and a text extraction good enough for the
// model to cite (title + readable body, no scripts/styles).
async function fetchPage(
  rawUrl,
  {
    fetchImpl = fetch,
    lookupImpl,
    timeoutMs = 5000,
    maxBytes = MAX_BYTES_DEFAULT,
    maxChars = 4000,
    maxRedirects = MAX_REDIRECTS_DEFAULT,
    cacheTtlMs = PAGE_CACHE_TTL_MS,
    now = Date.now,
  } = {}
) {
  const canonical = canonicalUrl(rawUrl);
  if (!canonical) throw new Error('research_url_invalid');

  const cacheKey = `p:${canonical}`;
  const hit = cacheGet(cacheKey, now());
  if (hit) return { ...hit, cached: true };

  let current = await assertSafeUrl(canonical, { lookupImpl });
  let response;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    response = await timedFetch(current.href, { redirect: 'manual' }, fetchImpl, timeoutMs);
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location) break;
    if (hop === maxRedirects) throw new Error('research_too_many_redirects');
    current = await assertSafeUrl(new URL(location, current.href).href, { lookupImpl });
  }

  if (!response.ok) throw new Error(`research_http_${response.status}`);

  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (type && !type.includes('text/html') && !type.includes('text/plain') && !type.includes('xml')) {
    throw new Error('research_unsupported_type');
  }

  const html = await readCapped(response, maxBytes);
  const value = {
    url: current.href,
    title: extractTitle(html),
    text: extractText(html, maxChars),
  };
  cacheSet(cacheKey, value, cacheTtlMs, now());
  return { ...value, cached: false };
}

// ------------------------------------------------------ query planning -----

// System line for the planner call; the route pairs it with buildPlannerPrompt
// through the injected ask function.
const PLANNER_SYSTEM =
  'You plan web searches for a project blueprint researcher. You output ONLY a JSON array of search query strings.';

// A cheap model proposes the queries (brief 4.5 stage 2). The ask function is
// injected by the route so this module stays provider-free; a failed or
// malformed plan degrades to no queries, which means no research, which means
// the blueprint still runs on the visitor's own words.

function buildPlannerPrompt(input, maxQueries) {
  return [
    'Project description:',
    String(input ?? '').slice(0, 2000),
    '',
    `Output a JSON array of 1 to ${maxQueries} web search queries (each at most 12 words) that would`,
    'find concrete, citable facts relevant to this project: domain standards,',
    'comparable tools, real constraints. Specific beats generic. Output the',
    'array only, no prose.',
  ].join('\n');
}

function parseQueries(raw, maxQueries) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item === 'string' && item.trim())
      .map((item) => item.trim().slice(0, 120))
      .slice(0, maxQueries);
  } catch {
    return [];
  }
}

async function planQueries({ input, ask, maxQueries = 2, timeoutMs = 4000 }) {
  if (typeof ask !== 'function') return [];
  try {
    const raw = await Promise.resolve(ask(buildPlannerPrompt(input, maxQueries), timeoutMs));
    return parseQueries(raw, maxQueries);
  } catch {
    return [];
  }
}

// --------------------------------------------------------- orchestrator ----

// The whole research stage for one run: plan -> search -> fetch, inside a
// wall-clock budget, never throwing. Returns pages for the RESEARCH_PACK, the
// number of paid search calls, the planned queries and the dollar estimate.
async function runResearch({
  input,
  config,
  ask,
  fetchImpl = fetch,
  lookupImpl,
  now = Date.now,
}) {
  const out = { pages: [], searches: 0, queries: [], usdEstimate: 0 };
  if (!config || !config.researchEnabled || !config.searchApiKey) return out;

  const deadline = now() + Math.max(1000, config.researchTimeoutMs || 8000);
  const remaining = () => Math.max(250, deadline - now());

  const queries = await planQueries({
    input,
    ask,
    maxQueries: config.researchMaxQueries || 2,
    timeoutMs: Math.min(4000, remaining()),
  });
  out.queries = queries;
  if (queries.length === 0 || now() > deadline) return out;

  const seen = new Set();
  const candidates = [];
  for (const query of queries) {
    if (out.searches >= (config.researchMaxSearches || 3) || now() > deadline) break;
    try {
      const { results, calls } = await searchWeb({
        query,
        num: 5,
        provider: config.searchProvider,
        apiKey: config.searchApiKey,
        fetchImpl,
        timeoutMs: Math.min(4000, remaining()),
        now,
      });
      out.searches += calls;
      for (const result of results) {
        const url = canonicalUrl(result.url);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        candidates.push({ url, title: result.title });
      }
    } catch (error) {
      console.error('Blueprint research: search failed:', error && error.message ? error.message : error);
    }
  }
  if (candidates.length === 0 || now() > deadline) {
    out.usdEstimate = Number((out.searches * (config.searchCostUsd || 0)).toFixed(6));
    return out;
  }

  const picks = candidates.slice(0, config.researchMaxFetches || 2);
  const settled = await Promise.allSettled(
    picks.map((pick) =>
      fetchPage(pick.url, {
        fetchImpl,
        lookupImpl,
        timeoutMs: Math.min(5000, remaining()),
        maxChars: config.pageTextMaxChars || 4000,
        now,
      })
    )
  );
  for (let index = 0; index < settled.length; index += 1) {
    const item = settled[index];
    if (item.status === 'fulfilled') {
      out.pages.push({
        url: item.value.url,
        title: item.value.title || picks[index].title || '',
        text: item.value.text,
      });
    } else {
      console.error('Blueprint research: fetch failed:', item.reason && item.reason.message ? item.reason.message : item.reason);
    }
  }

  out.usdEstimate = Number((out.searches * (config.searchCostUsd || 0)).toFixed(6));
  return out;
}

module.exports = {
  SERPER_ENDPOINT,
  TAVILY_ENDPOINT,
  PLANNER_SYSTEM,
  isPublicIp,
  assertSafeUrl,
  normalizeQuery,
  canonicalUrl,
  normalizeSearchResults,
  searchWeb,
  fetchPage,
  parseQueries,
  planQueries,
  runResearch,
  clearResearchCache,
  cacheGet,
  cacheSet,
};
