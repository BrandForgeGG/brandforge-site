'use strict';

// Registration channel notice: when a new member signs in for the first time, the team's
// Discord registration channel (DISCORD_REGISTRATION_URL) gets one welcome embed.
//
// Privacy: the email is masked before it leaves the server — first letter, asterisks,
// full domain — so the team can recognize the account without ever seeing the full
// address. The raw email is never placed in the payload.
//
// Design rules (same as lib/notify.js and lib/ops-events.js):
// - Never throws and never blocks sign-in: without the env var every call is a silent
//   no-op, and failures are logged and reported in the return value.
// - Dependency-free CommonJS so node --test can exercise it without a build.

const SEND_TIMEOUT_MS = 5000;
const RETRY_AFTER_CAP_MS = 5000;

// brandforge.gg@gmail.com -> b*****@gmail.com. Uppercase is normalised so the mask is
// deterministic. Emails without a domain are unrecognisable either way — show the dots
// rather than inventing a pattern.
function maskEmail(email) {
  const value = String(email ?? '').trim().toLowerCase();
  const at = value.indexOf('@');
  if (at <= 0) return '•••';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!domain) return '•••';
  return `${local[0]}*****@${domain}`;
}

// A user row comes into being during the OAuth exchange this request is finishing, so a
// very fresh created_at means first sign-in. The window tolerates clock skew, and a
// returning member's created_at is always well past it.
function isFreshSignup(createdAt, now = Date.now()) {
  const time = Date.parse(String(createdAt ?? ''));
  if (!Number.isFinite(time)) return false;
  const ageMs = now - time;
  return ageMs >= 0 && ageMs <= 10 * 60 * 1000;
}

// The Discord webhook payload. Every field is built from the supplied facts; no
// user-controlled string reaches the embed unmasked.
function buildRegistrationPayload({ email, memberCount, when = new Date() } = {}) {
  const masked = maskEmail(email);
  const count =
    Number.isFinite(Number(memberCount)) && Number(memberCount) > 0
      ? String(Math.trunc(Number(memberCount)))
      : null;

  const description = count
    ? `Welcome **${masked}** to BrandForge — they are member #${count}.`
    : `Welcome **${masked}** to BrandForge.`;

  const whenMs = when instanceof Date ? when.getTime() : Date.parse(String(when));
  const stamp = new Date(Number.isFinite(whenMs) ? whenMs : Date.now());

  return {
    username: 'BrandForge',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: 'New member registered',
        description,
        color: 0xe8571e,
        fields: [
          { name: 'Member', value: count ? `#${count}` : '—', inline: true },
          {
            name: 'Registered',
            value: stamp.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'),
            inline: true,
          },
        ],
        footer: { text: 'BrandForge · registrations' },
        timestamp: stamp.toISOString(),
      },
    ],
  };
}

// Best-effort sender for the registration channel. Honours a Discord 429 exactly once,
// matching the ops-events behaviour.
async function postRegistrationNotice({ email, memberCount, when, env = process.env, fetchImpl = fetch } = {}) {
  const webhookUrl = String((env || process.env).DISCORD_REGISTRATION_URL || '').trim();
  if (!webhookUrl) {
    return { sent: false, reason: 'not_configured' };
  }

  const payload = buildRegistrationPayload({ email, memberCount, when });
  const fetchFn = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  if (typeof fetchFn !== 'function') {
    return { sent: false, reason: 'no_fetch' };
  }

  const send = () =>
    fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal:
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(SEND_TIMEOUT_MS)
          : undefined,
    });

  try {
    let response = await send();
    if (response && response.status === 429) {
      let waitMs = 1000;
      try {
        const retryAfter =
          response.headers && typeof response.headers.get === 'function'
            ? Number(response.headers.get('retry-after'))
            : NaN;
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          waitMs = Math.min(retryAfter * 1000, RETRY_AFTER_CAP_MS);
        }
      } catch {
        // Default wait stands.
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      response = await send();
    }

    if (!response || !response.ok) {
      const status = response ? response.status : 'no_response';
      console.error(`registration notice: webhook answered HTTP ${status}`);
      return { sent: false, reason: `http_${status}` };
    }

    return { sent: true };
  } catch (error) {
    console.error('registration notice failed:', error instanceof Error ? error.message : error);
    return { sent: false, reason: 'network' };
  }
}

module.exports = {
  maskEmail,
  isFreshSignup,
  buildRegistrationPayload,
  postRegistrationNotice,
};
