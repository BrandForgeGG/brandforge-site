'use strict';

// True only for parseable http(s) URLs. Used by admin APIs before any URL
// column is written — the database stores plain text, so the API is the gate
// that keeps javascript:, data: and garbage out of links we later render.
function isValidUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

module.exports = { isValidUrl };
