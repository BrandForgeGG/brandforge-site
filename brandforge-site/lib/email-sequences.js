'use strict';

// The product-email sequence for new members: a few short messages that lead one person from
// "signed up" to "made and posted something", then stop. Pure rules, no sending here.
//
// Rules that keep it honest:
// - only people who opted in to product updates (and never test accounts);
// - each step is sent at most once per person (the database holds that, this only decides);
// - a step is skipped when the person already did what it asks for;
// - a step has a window, so someone who joined months ago is never flooded with "day 1" mail;
// - at least two days between any two messages, and a hard end: nothing after day 21.

const DAY = 24 * 60 * 60 * 1000;

const STEPS = [
  { kind: 'seq_first_carousel', afterDays: 1, windowDays: 6, skipIf: (s) => s.hasCarousel || s.hasChat },
  { kind: 'seq_hooks', afterDays: 3, windowDays: 7, skipIf: () => false },
  { kind: 'seq_week', afterDays: 7, windowDays: 7, skipIf: (s) => !s.hasCarousel },
  { kind: 'seq_checkin', afterDays: 14, windowDays: 7, skipIf: (s) => s.hasCarousel || s.hasChat },
];

const KINDS = STEPS.map((step) => step.kind);

/**
 * @param {{ createdAt: string|Date, optIn: boolean, hasCarousel?: boolean, hasChat?: boolean, sent?: Iterable<string>, lastSentAt?: string|Date|null, now?: Date }} person
 * @returns {string|null} the one email kind to send now, or null
 */
function nextSequenceEmail(person) {
  if (!person || !person.optIn) return null;
  const now = (person.now || new Date()).getTime();
  const created = new Date(person.createdAt).getTime();
  if (!Number.isFinite(created)) return null;
  const ageDays = (now - created) / DAY;
  if (ageDays < 1 || ageDays > 22) return null;

  if (person.lastSentAt) {
    const last = new Date(person.lastSentAt).getTime();
    if (Number.isFinite(last) && now - last < 2 * DAY) return null;
  }

  const sent = new Set(person.sent || []);
  const state = { hasCarousel: Boolean(person.hasCarousel), hasChat: Boolean(person.hasChat) };
  for (const step of STEPS) {
    if (sent.has(step.kind)) continue;
    if (ageDays < step.afterDays || ageDays > step.afterDays + step.windowDays) continue;
    if (step.skipIf(state)) continue;
    return step.kind;
  }
  return null;
}

module.exports = { STEPS, KINDS, nextSequenceEmail };
