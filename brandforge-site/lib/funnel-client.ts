// Client-side funnel tracking.
//
// Minimal by design: no third-party SDK, no cookies, no cross-site identifiers. The visitor id is a
// random id in first-party storage with no personal data in it, and it is only used to count how many
// distinct people passed a step. It is never the account id and never the email.
//
// Every call is fire-and-forget and swallows its own errors: analytics must never surface an error
// to a user or block an interaction.
'use client';

const VISITOR_KEY = 'bf_visitor_id';
const sessionKey = 'bf_visitor_session';

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the manual path below.
  }
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Session-scoped: cleared on reload so one person does not look like many visitors in a short
// window, while still letting a single visit chain steps together.
function visitorId(): string {
  if (typeof window === 'undefined') return '';

  try {
    const existing = window.sessionStorage.getItem(sessionKey);
    if (existing) return existing;
    const created = randomId();
    window.sessionStorage.setItem(sessionKey, created);
    // First-party only, and only to detect a returning visitor in aggregate. Not a cookie, not sent
    // to any third party, and contains nothing derived from the account.
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    // Storage can be blocked; tracking still works, just without a visitor id.
    return '';
  }
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;

  try {
    const body = JSON.stringify({
      event,
      visitorId: visitorId(),
      ...(properties ? { properties } : {}),
    });
    // keepalive so the event survives a navigation away (e.g. clicking a CTA right after).
    void fetch('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never surface a tracking failure.
  }
}