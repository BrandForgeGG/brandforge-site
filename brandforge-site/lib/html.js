'use strict';

// Minimal HTML entity escaping for user-controlled strings interpolated into
// email HTML (display names and conversation titles are attacker-controlled:
// Google full_name is set by the account, titles by the founder). Dependency-free
// CommonJS so node:test can exercise it without a build.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// One-line, control-char-free text for email subjects and Telegram lines: a raw
// newline in a subject is at best mangled, at worst header metadata.
function oneLine(value, max = 120) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

module.exports = { escapeHtml, oneLine };
