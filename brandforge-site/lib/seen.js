'use strict';

/** "Online now" within 5 minutes, then "seen 12 min ago", "seen 3 h ago", "seen 2 days ago". Empty without a time. */
function seenLabel(iso, now = Date.now()) {
  const time = Date.parse(String(iso || ''));
  if (!Number.isFinite(time)) return '';
  const minutes = Math.max(0, Math.round((now - time) / 60000));
  if (minutes < 5) return 'Online now';
  if (minutes < 60) return `Seen ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Seen ${hours} h ago`;
  const days = Math.round(hours / 24);
  return `Seen ${days} day${days === 1 ? '' : 's'} ago`;
}

module.exports = { seenLabel };
