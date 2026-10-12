'use strict';

// Cookie consent, kept pure so the browser and the tests share one definition. Strictly necessary cookies (sign-in, the
// theme and layout choices) need no consent. Everything that measures visits (Vercel Analytics, the first-party funnel) runs
// only after the visitor says yes. The choice itself is stored in one cookie, `bf_consent`, for six months.
const CONSENT_COOKIE = 'bf_consent';
const CONSENT_EVENT = 'bf:consent';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 182;

/** Reads the visitor's choice from a document.cookie string: 'all', 'essential', or null when they have not chosen yet. */
function readConsent(cookieString) {
  if (typeof cookieString !== 'string') return null;
  for (const part of cookieString.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== CONSENT_COOKIE) continue;
    const value = part.slice(index + 1).trim();
    return value === 'all' || value === 'essential' ? value : null;
  }
  return null;
}

/** The Set-Cookie string for a choice. Secure only on https so local development still works. */
function consentCookie(value, secure) {
  const choice = value === 'all' ? 'all' : 'essential';
  return `${CONSENT_COOKIE}=${choice}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** Measurement is allowed only after an explicit yes. */
function analyticsAllowed(cookieString) {
  return readConsent(cookieString) === 'all';
}

module.exports = { CONSENT_COOKIE, CONSENT_EVENT, readConsent, consentCookie, analyticsAllowed };
