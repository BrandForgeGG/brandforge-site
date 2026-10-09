'use strict';

// Specialist profile rules, kept pure so the API and the tests share one source of truth.
const HANDLE = /^[a-z0-9][a-z0-9-]{2,29}$/;
const RESERVED = new Set(['me', 'edit', 'new', 'admin', 'apply', 'api', 'brandforge']);

function clean(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function toHandle(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** @returns {{ ok: true, value: object } | { ok: false, error: string }} */
function validateProfile(input) {
  const handle = toHandle(input && input.handle);
  if (!HANDLE.test(handle) || RESERVED.has(handle)) {
    return { ok: false, error: 'Pick a handle of 3 to 30 letters, numbers or dashes.' };
  }
  const displayName = clean(input.displayName, 80);
  if (displayName.length < 2) return { ok: false, error: 'Add the name people should see.' };
  const headline = clean(input.headline, 100);
  if (headline.length < 5) return { ok: false, error: 'Add a one-line headline, for example "Motion designer for game studios".' };
  const bio = String(input.bio ?? '').replace(/\r/g, '').trim().slice(0, 1200);
  const skills = [...new Set((Array.isArray(input.skills) ? input.skills : String(input.skills ?? '').split(','))
    .map((s) => clean(s, 30)).filter(Boolean))].slice(0, 12);
  const portfolio = (Array.isArray(input.portfolio) ? input.portfolio : [])
    .map((item) => ({ title: clean(item && item.title, 80), url: safeUrl(item && item.url) }))
    .filter((item) => item.title && item.url)
    .slice(0, 8);
  return { ok: true, value: { handle, displayName, headline, bio, skills, portfolio, isPublic: Boolean(input.isPublic) } };
}

module.exports = { HANDLE, validateProfile, toHandle, safeUrl };
