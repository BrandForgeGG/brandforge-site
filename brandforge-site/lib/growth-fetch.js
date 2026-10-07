'use strict';

const { growthConfig } = require('./growth-config.js');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'instance-data',
  'internal',
]);

function isPublicIp(ip) {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    if (v6.startsWith('::ffff:')) {
      return isPublicIp(v6.slice(7));
    }
    if (v6 === '::1' || v6 === '::') return false;
    if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return false;
    if (v6.startsWith('2001:db8')) return false;
    const first = parseInt(v6.split(':')[0], 16);
    if ((first & 0xe000) === 0x2000) return true;
    return false;
  }

  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;

  if (a === 0 || a === 127) return false;
  if (a === 10) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;

  return true;
}

async function assertSafeUrl(raw, { lookupImpl = defaultLookup } = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('growth_fetch_invalid_url');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('growth_fetch_invalid_protocol');
  }

  if (url.username || url.password) {
    throw new Error('growth_fetch_credentials_in_url');
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
    throw new Error('growth_fetch_blocked_host');
  }

  if (hostname === '0.0.0.0') {
    throw new Error('growth_fetch_blocked_host');
  }

  const ipv4Match = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  if (ipv4Match) {
    if (!isPublicIp(hostname)) throw new Error('growth_fetch_private_ip');
    return url;
  }

  const ipv6Match = hostname.match(/^\[([0-9a-f:]+)\]$/);
  if (ipv6Match) {
    if (!isPublicIp(ipv6Match[1])) throw new Error('growth_fetch_private_ip');
    return url;
  }

  let addresses;
  try {
    addresses = await lookupImpl(hostname);
  } catch {
    throw new Error('growth_fetch_dns_failed');
  }

  if (!addresses || addresses.length === 0) {
    throw new Error('growth_fetch_dns_no_answer');
  }

  for (const addr of addresses) {
    if (!isPublicIp(addr)) throw new Error('growth_fetch_private_ip');
  }

  return url;
}

async function defaultLookup(hostname) {
  const dns = require('node:dns').promises;
  try {
    const result = await dns.lookup(hostname, { all: true, verbatim: true });
    return result.map((r) => r.address);
  } catch {
    const v4 = await dns.resolve4(hostname).catch(() => []);
    const v6 = await dns.resolve6(hostname).catch(() => []);
    return [...v4, ...v6];
  }
}

async function fetchUrl(rawUrl, {
  fetchImpl = fetch,
  lookupImpl = defaultLookup,
  timeoutMs,
  maxBytes,
  maxRedirects,
  config: configOverride,
} = {}) {
  const config = configOverride || growthConfig();
  const timeout = timeoutMs || config.fetchTimeoutMs;
  const cap = maxBytes || config.fetchMaxBytes;
  const maxHops = maxRedirects || config.fetchMaxRedirects;

  let current = await assertSafeUrl(rawUrl, { lookupImpl });
  let response;

  for (let hop = 0; hop <= maxHops; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      response = await fetchImpl(current.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'BrandForge-Growth/1.0' },
      });
    } catch (err) {
      clearTimeout(timer);
      throw new Error(`growth_fetch_network: ${String(err).slice(0, 200)}`);
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      clearTimeout(timer);
      break;
    }

    const location = response.headers.get('location');
    clearTimeout(timer);
    if (!location) break;

    current = await assertSafeUrl(new URL(location, current.href).href, { lookupImpl });
  }

  const contentType = response.headers.get('content-type') || '';
  const allowedTypes = ['text/html', 'text/plain', 'application/xml', 'text/xml', 'application/json'];
  const isAllowed = allowedTypes.some((t) => contentType.includes(t));
  if (!isAllowed) {
    throw new Error(`growth_fetch_content_type: ${contentType.slice(0, 100)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (text.length > cap) throw new Error('growth_fetch_too_large');
    return { text, contentType, url: current.href };
  }

  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > cap) {
      await reader.cancel();
      throw new Error('growth_fetch_too_large');
    }
    chunks.push(value);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  return { text, contentType, url: current.href };
}

module.exports = { fetchUrl, assertSafeUrl, isPublicIp };
