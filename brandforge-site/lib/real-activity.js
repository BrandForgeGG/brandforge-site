'use strict';

// What counts as a real person. Everything announced publicly (Discord, Telegram, the live
// numbers) must come from real users: never from staff testing, never from throwaway test
// accounts, never from conversations marked as test traffic.

// Throwaway accounts used by probes and walk-throughs: probe-…, demo-…, test-…, e2e-…, qa-…
const TEST_EMAIL = /^(probe|demo|test|e2e|tmp|qa)[-_.+0-9]/i;
const TEST_DOMAIN = /@(example\.(com|org|net)|test\.|localhost)/i;
const STAFF_ROLES = new Set(['admin', 'operator']);

function extraTestEmails(env = process.env) {
  return String((env && env.TEST_ACCOUNT_EMAILS) || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isTestEmail(email, env = process.env) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return false;
  if (extraTestEmails(env).includes(value)) return true;
  return TEST_EMAIL.test(value) || TEST_DOMAIN.test(value);
}

// actor: { email?, role?, source? } of the person (or the conversation) behind an event.
// A guest has no email or role and counts as real unless the traffic itself is marked test.
function isRealActor(actor, env = process.env) {
  if (!actor) return true;
  if (actor.source === 'test') return false;
  if (actor.role && STAFF_ROLES.has(String(actor.role))) return false;
  if (isTestEmail(actor.email, env)) return false;
  return true;
}

// Every involved person must be real for an event to be announced.
function allReal(actors, env = process.env) {
  return (actors || []).every((actor) => isRealActor(actor, env));
}

module.exports = { isTestEmail, isRealActor, allReal, STAFF_ROLES };
