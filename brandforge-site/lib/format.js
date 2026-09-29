'use strict';

// Shared text primitives for every user-facing message builder (Telegram, email,
// Discord embeds). One clip and one money formatter so the same input renders
// identically everywhere instead of drifting per module.

function truncateText(value, max = 160) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function formatMoney(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return '';
  // Currency codes are short; anything longer is hostile input being clipped.
  return `${truncateText(currency, 8) || 'EUR'} ${value.toLocaleString('en-US')}`;
}

module.exports = { truncateText, formatMoney };
