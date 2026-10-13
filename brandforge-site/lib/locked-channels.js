'use strict';

// Platforms BrandForge has built but switched off, with the reason said plainly. A locked platform cannot be picked for posting,
// its connect button is replaced by the reason, and the server refuses to send to it even if an old connection exists.
// X: its API charges for every post, and BrandForge cannot afford it for now (2026-10-13).
const LOCKED = {
  x: 'BrandForge cannot afford to use X for now. Donate to help us turn it back on.',
};

function isLocked(kind) {
  return Object.prototype.hasOwnProperty.call(LOCKED, kind);
}

function lockedReason(kind) {
  return isLocked(kind) ? LOCKED[kind] : null;
}

// Where "Donate" goes. Set NEXT_PUBLIC_DONATE_URL to a donation page; until then the link opens a chat with the team.
function donateUrl(env = process.env) {
  const url = String(env.NEXT_PUBLIC_DONATE_URL || '').trim();
  return /^https:\/\//.test(url) ? url : 'https://t.me/headstartup';
}

module.exports = { LOCKED, isLocked, lockedReason, donateUrl };
