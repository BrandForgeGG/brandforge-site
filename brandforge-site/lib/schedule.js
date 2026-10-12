'use strict';

// Scheduled posts: the pure rules. When a post may be scheduled, which are due, how a run's results become a status, and
// how a stuck run is retried. Sending and storage live in lib/schedule-run.ts.
const MAX_AHEAD_MS = 62 * 24 * 60 * 60 * 1000;
const MAX_CAPTION = 3000;
const MAX_SLIDES = 10;
const MAX_ATTEMPTS = 3;
const STUCK_AFTER_MS = 15 * 60 * 1000;

/** @returns {{ ok: true, runAt: string } | { ok: false, error: string }} */
function validateSchedule(input, nowMs = Date.now()) {
  const data = input && typeof input === 'object' ? input : {};
  const at = new Date(String(data.runAt || ''));
  if (Number.isNaN(at.getTime())) return { ok: false, error: 'Pick a date and time.' };
  if (at.getTime() > nowMs + MAX_AHEAD_MS) return { ok: false, error: 'You can schedule up to two months ahead.' };
  const channels = Array.isArray(data.channelIds) ? data.channelIds.filter((id) => typeof id === 'string' && id) : [];
  if (channels.length === 0) return { ok: false, error: 'Pick a channel to post to.' };
  if (String(data.caption || '').length > MAX_CAPTION) return { ok: false, error: 'That caption is too long.' };
  const slides = Number(data.slideCount);
  if (!Number.isInteger(slides) || slides < 1 || slides > MAX_SLIDES) return { ok: false, error: 'There are no pictures to post.' };
  // A time already past is sent on the next run instead of being refused: the plan's early slots are often "this morning".
  return { ok: true, runAt: at.toISOString() };
}

/** Rows that should be sent now: scheduled, due, and not out of tries. */
function dueRows(rows, nowMs = Date.now()) {
  return rows.filter((row) => row.status === 'scheduled' && new Date(row.run_at).getTime() <= nowMs && (row.attempts || 0) < MAX_ATTEMPTS);
}

/** The status a finished run ends in. Every channel ok is done; some is partial; none is failed. */
function outcomeOf(results) {
  const list = Object.values(results || {});
  if (list.length === 0) return 'failed';
  const ok = list.filter((r) => r && r.ok).length;
  return ok === list.length ? 'done' : ok === 0 ? 'failed' : 'partial';
}

/** A run that began and never finished (the function was cut off) goes back to scheduled while it has tries left. */
function isStuck(row, nowMs = Date.now()) {
  return row.status === 'posting' && nowMs - new Date(row.claimed_at || row.run_at).getTime() > STUCK_AFTER_MS;
}

module.exports = { MAX_ATTEMPTS, MAX_SLIDES, STUCK_AFTER_MS, validateSchedule, dueRows, outcomeOf, isStuck };
