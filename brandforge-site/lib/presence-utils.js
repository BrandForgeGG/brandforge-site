// Presence + typing payload shaping for the Realtime channel.
// Kept dependency-free (no React, no Supabase import) so node:test can cover the
// edge cases directly: a viewer with a blank name, a duplicate join from the same
// user in two tabs, and a self-entry that must never leak into the UI.

const MAX_NAME = 40;

function cleanName(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, MAX_NAME);
}

// Realtime hands back `{ [presenceKey]: Presence[] }`. Multiple entries under one key mean the
// same person has the app open in more than one tab, which must count once for "who is here".
export function shapePresenceState(state, self) {
  if (!state || typeof state !== 'object') return [];

  const byUser = new Map();
  for (const entries of Object.values(state)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const userId = String(entry?.userId ?? self.userId);
      if (userId === self.userId || byUser.has(userId)) continue;
      byUser.set(userId, {
        name: cleanName(entry?.name, entry?.staff ? 'BrandForge team' : 'Teammate'),
        staff: Boolean(entry?.staff),
      });
    }
  }
  return [...byUser.values()];
}

// Only the other people currently typing, deduplicated, in a stable order.
export function shapeTypingState(state, selfUserId) {
  if (!state || typeof state !== 'object') return [];
  const names = new Set();
  for (const entries of Object.values(state)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry?.typing || String(entry?.userId ?? '') === selfUserId) continue;
      names.add(cleanName(entry?.name, 'Someone'));
    }
  }
  return [...names].slice(0, 3);
}

// Shared by the sidebar counters and the conversation header so both answer "is the team here?".
export function countStaffPresence(state) {
  if (!state || typeof state !== 'object') return 0;
  let staff = 0;
  for (const entries of Object.values(state)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) if (entry?.staff) staff += 1;
  }
  return staff;
}

// "Ada is typing…" / "Ada and 2 others are typing…" — never an empty string.
export function formatTypingLabel(names) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  if (list.length === 0) return '';
  if (list.length === 1) return `${list[0]} is typing…`;
  if (list.length === 2) return `${list[0]} and ${list[1]} are typing…`;
  return `${list[0]} and ${list.length - 1} others are typing…`;
}
