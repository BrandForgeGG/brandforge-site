'use strict';

// First-party funnel events.
//
// Why this exists: no analytics vendor has been chosen, and the brief is explicit that numbers must
// be real, honestly reported, and land "somewhere a human will look". Rather than block on a vendor
// decision or bolt on a third-party tracker, this records a small, fixed set of product events into
// our own database. It is deliberately boring: no cookies, no cross-site identifiers, no IP, no user
// agent, no fingerprinting.
//
// Privacy rules baked in:
// - The visitor id is a random, first-party UUID with no personal data in it. It is not the user id,
//   not the email, and not derived from either.
// - Signed-in events record only a boolean (`signed_in`), never the account id, so a funnel can be
//   read without joining it back to a person.
// - `properties` is a small allowlist of primitives, scrubbed and length-capped. No free text, no
//   message bodies, no email, no tx hash.
//
// Every function is failure-tolerant: a funnel metric must never break, delay, or fail a product
// request. `track()` never throws, and every call site can fire-and-forget.

const MAX_PROPERTY_KEYS = 6;
const MAX_PROPERTY_LENGTH = 80;

// Key allowlist. This is the important control: without it, any caller could smuggle an email, a
// transaction hash, or a message body into the events table under an innocently-named key. Only the
// keys below are ever stored, so a call site cannot leak anything it did not think about.
const ALLOWED_PROPERTY_KEYS = new Set([
  'percent',            // discovery completeness
  'source',             // where an event came from, e.g. 'command' | 'panel' | 'embed'
  'stage',              // pipeline stage name
  'status',             // a status enum, not free text
  'currency',
  'total_amount',
  'amount',
  'weeks',
  'network',
  'milestone_count',
  'task_count',
  'signed_in',
]);

// The complete, closed set of events we record. Anything else is rejected so a typo at a call site
// cannot silently create a metric nobody reports on.
const FUNNEL_EVENTS = Object.freeze([
  // Founder funnel
  'landing_viewed',
  'signin_started',
  'chat_started',
  'project_described',
  'review_requested',
  'proposal_received',
  'proposal_accepted',
  'contract_signed',
  'funding_submitted',
  'funding_verified',
  'milestone_completed',
  'payment_released',
  'repeat_project_started',
  // Specialist funnel
  'apply_started',
  'apply_submitted',
  'application_approved',
]);

const EVENT_SET = new Set(FUNNEL_EVENTS);

function isFunnelEvent(event) {
  return EVENT_SET.has(event);
}

// Only allowlisted keys survive, and only as primitives. This is the guard that stops a caller from
// smuggling a message body, an email, or a transaction hash into the events table.
function sanitizeProperties(properties) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};

  const out = {};
  let kept = 0;

  for (const [rawKey, rawValue] of Object.entries(properties)) {
    if (kept >= MAX_PROPERTY_KEYS) break;

    // Call sites naturally write camelCase (`signedIn`, `totalAmount`). Normalize that to
    // snake_case before checking the allowlist, otherwise a correctly-named key would be silently
    // dropped and the metric would quietly under-count.
    const key = String(rawKey)
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32)
      .toLowerCase();
    if (!key || !ALLOWED_PROPERTY_KEYS.has(key)) continue;

    let value;
    if (typeof rawValue === 'boolean') {
      value = rawValue;
    } else if (typeof rawValue === 'number') {
      if (!Number.isFinite(rawValue)) continue;
      value = Math.round(rawValue * 100) / 100;
    } else if (typeof rawValue === 'string') {
      value = rawValue.replace(/\s+/g, ' ').trim().slice(0, MAX_PROPERTY_LENGTH);
      if (!value) continue;
    } else {
      continue;
    }

    out[key] = value;
    kept += 1;
  }

  return out;
}

/**
 * Record a funnel event. Never throws; a failure is reported in the return value only.
 *
 * @param {string} event         one of FUNNEL_EVENTS
 * @param {object} [options]
 * @param {string} [options.insert]  async (row) => unknown — the caller's persistence function.
 *                                   Injected so this module stays dependency-free and unit-testable.
 * @param {boolean} [options.signedIn]
 * @param {string} [options.visitorId]
 * @param {object} [options.properties]
 * @returns {Promise<{ recorded: boolean, event?: string, error?: string }>}
 */
async function track(event, options = {}) {
  const name = String(event ?? '').trim().toLowerCase();

  if (!isFunnelEvent(name)) {
    return { recorded: false, error: `unknown funnel event: ${name || '(empty)'}` };
  }

  const { insert, signedIn = false, visitorId = '', properties } = options;

  if (typeof insert !== 'function') {
    return { recorded: false, error: 'no insert function provided' };
  }

  const row = {
    event: name,
    signed_in: Boolean(signedIn),
    visitor_id: String(visitorId || '').slice(0, 64) || null,
    properties: sanitizeProperties(properties),
    created_at: new Date().toISOString(),
  };

  try {
    await insert(row);
    return { recorded: true, event: name };
  } catch (error) {
    // A metrics write must never surface to a user or fail their action.
    console.error('Funnel track failed:', error instanceof Error ? error.message : error);
    return { recorded: false, event: name, error: 'insert failed' };
  }
}

module.exports = { FUNNEL_EVENTS, ALLOWED_PROPERTY_KEYS, isFunnelEvent, sanitizeProperties, track };
