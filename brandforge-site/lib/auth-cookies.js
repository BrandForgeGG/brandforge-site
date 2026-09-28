// Cookie helpers shared by middleware and tests. Plain CJS so node --test can require it.

function parseCookieHeader(raw) {
  if (!raw) return [];
  return raw
    .split(';')
    .map((pair) => {
      const idx = pair.indexOf('=');
      if (idx === -1) return null;
      const name = pair.slice(0, idx).trim();
      const rawValue = pair.slice(idx + 1).trim();
      try {
        return { name, value: decodeURIComponent(rawValue) };
      } catch {
        return { name, value: rawValue };
      }
    })
    .filter((c) => c !== null);
}

function isAuthCookieName(name) {
  return name.includes('auth-token');
}

function isCookieDeletion(update) {
  return !update.value || (update.options?.maxAge ?? 1) === 0;
}

// Rebuild the Cookie header after middleware token refresh so route handlers
// never re-refresh with a rotation that already happened on this request.
function applyCookieUpdates(rawCookie, updates) {
  const map = new Map();

  for (const { name, value } of parseCookieHeader(rawCookie)) {
    map.set(name, value);
  }

  for (const update of updates) {
    if (isCookieDeletion(update)) {
      map.delete(update.name);
    } else {
      map.set(update.name, update.value);
    }
  }

  return Array.from(map.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

// If the browser still had an auth session on the way in, middleware must never
// wipe auth cookies on a failed refresh. Only /auth/signout clears sessions.
// Successful token refresh must delete old chunked cookies and write new ones in
// the same batch — blocking those deletions left stale + new chunks mixed, so
// the next /settings or /chat navigation looked signed-out.
function stripAuthCookieDeletions(originalCookies, updates) {
  const hadAuthCookies = originalCookies.some(
    (cookie) => isAuthCookieName(cookie.name) && cookie.value
  );
  if (!hadAuthCookies) return updates;

  // Refresh rewrite: allow the full setAll batch (deletes + new auth cookies).
  const hasAuthWrites = updates.some(
    (update) => isAuthCookieName(update.name) && !isCookieDeletion(update)
  );
  if (hasAuthWrites) return updates;

  const originalAuth = new Map(
    originalCookies
      .filter((cookie) => isAuthCookieName(cookie.name))
      .map((cookie) => [cookie.name, cookie.value])
  );

  const next = [];

  for (const update of updates) {
    if (!isAuthCookieName(update.name) || !isCookieDeletion(update)) {
      next.push(update);
      continue;
    }

    const original = originalAuth.get(update.name);
    if (original !== undefined) {
      next.push({
        name: update.name,
        value: original,
        options: { ...update.options, maxAge: undefined },
      });
    }
  }

  return next;
}

// Reassemble chunked @supabase/ssr cookies (key, key.0, key.1, …).
function combineAuthChunks(pairs) {
  const byName = new Map(pairs.map((c) => [c.name, c.value]));
  const baseNames = new Set();

  for (const { name } of pairs) {
    if (!isAuthCookieName(name)) continue;
    const chunkMatch = name.match(/^(.*)\.(0|[1-9][0-9]*)$/);
    baseNames.add(chunkMatch ? chunkMatch[1] : name);
  }

  for (const base of baseNames) {
    const whole = byName.get(base);
    if (whole) return whole;

    const parts = [];
    for (let i = 0; ; i += 1) {
      const part = byName.get(`${base}.${i}`);
      if (part === undefined) break;
      parts.push(part);
    }
    if (parts.length > 0) return parts.join('');
  }

  return null;
}

// Every base-name's cookie payload as its own candidate (whole preferred over
// chunks). A browser can hold auth cookies under more than one base name at
// once — a stale generation or an old project ref that no Set-Cookie will ever
// overwrite — and the first base's join may not even decode. Callers must try
// candidates instead of trusting the first one.
function combinedAuthCandidates(pairs) {
  const bases = new Map();
  for (const { name, value } of pairs) {
    if (!isAuthCookieName(name)) continue;
    const chunkMatch = name.match(/^(.*)\.(0|[1-9][0-9]*)$/);
    const base = chunkMatch ? chunkMatch[1] : name;
    let entry = bases.get(base);
    if (!entry) {
      entry = { whole: null, parts: new Map() };
      bases.set(base, entry);
    }
    if (chunkMatch) entry.parts.set(Number(chunkMatch[2]), value);
    else entry.whole = value;
  }

  const candidates = [];
  for (const [base, entry] of bases) {
    if (entry.whole) candidates.push({ base, value: entry.whole });
    const parts = [];
    for (let i = 0; ; i += 1) {
      const part = entry.parts.get(i);
      if (part === undefined) break;
      parts.push(part);
    }
    if (parts.length > 0) candidates.push({ base, value: parts.join('') });
  }
  return candidates;
}

// The storage key base for the Supabase project this build talks to
// (sb-<ref>-auth-token). Cookies under any other base are leftovers from an
// earlier ref and must lose to the current one even when they sort first in
// the header.
function currentAuthBaseName() {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
    const ref = host.split('.')[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

// First session cookie that actually decodes into a session the caller can
// use, with the current ref's cookies winning over any other base. Falls back
// to another base's valid session when the current ref's cookie is missing or
// corrupt.
function pickSession(pairs, isValidSession) {
  const current = currentAuthBaseName();
  const candidates = combinedAuthCandidates(pairs).sort((a, b) => {
    if (!current) return 0;
    return Number(b.base === current) - Number(a.base === current);
  });

  let fallback = null;
  for (const { base, value } of candidates) {
    const session = decodeSessionJson(value);
    if (!session || typeof session !== 'object' || !isValidSession(session)) continue;
    if (current && base === current) return session;
    if (!fallback) fallback = session;
  }
  return fallback;
}

function base64UrlToUtf8(str) {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8');
  }
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Decode session JSON from a cookie value (raw JSON or base64- prefixed).
function decodeSessionJson(value) {
  if (!value) return null;
  try {
    if (value.startsWith('base64-')) {
      return JSON.parse(base64UrlToUtf8(value.slice('base64-'.length)));
    }
    return JSON.parse(decodeURIComponent(value));
  } catch {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}

// Local identity from auth cookies only — no Auth server, no rotation race.
// Access-token expiry is not checked here: knowing who you are ≠ holding a
// live JWT. Middleware/getSession own refresh; this only answers "is there a user?".
function sessionUserFromCookiePairs(pairs) {
  const session = pickSession(
    pairs,
    (s) => s.user && typeof s.user.id === 'string' && Boolean(s.user.id)
  );
  if (!session) return null;

  const user = session.user;

  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email : '',
    user_metadata: user.user_metadata ?? {},
    app_metadata: user.app_metadata ?? {},
    aud: typeof user.aud === 'string' ? user.aud : 'authenticated',
    created_at: typeof user.created_at === 'string' ? user.created_at : new Date().toISOString(),
  };
}

// Pull the JWT candidate out of parsed cookie pairs (null when there is none).
function tokenFromPairs(pairs) {
  const session = pickSession(
    pairs,
    (s) => typeof s.access_token === 'string' && Boolean(s.access_token)
  );
  return session ? session.access_token : null;
}

// x-forwarded-cookie is the middleware-rewritten Cookie header: the browser's
// cookies with any token refresh middleware performed on THIS request already
// applied. It must win over the untouched Cookie header and cookies() store,
// which still carry the pre-refresh (possibly expired) token the route would
// otherwise verify. Client-sent x-forwarded-cookie is deleted by middleware
// (H6) and whatever remains is signature-checked by auth.getUser anyway.
function sessionTokenFromSources(forwardedCookie, fallbackPairs) {
  if (forwardedCookie) {
    const forwardedToken = tokenFromPairs(parseCookieHeader(forwardedCookie));
    if (forwardedToken) return forwardedToken;
  }
  return tokenFromPairs(fallbackPairs);
}

// Access-token expiry (epoch seconds) from the merged auth cookie, or null when
// the cookie is absent or carries no expires_at field. Lets callers tell a
// live JWT apart from a stale one without contacting the Auth server.
function authCookieExpiresAt(pairs) {
  const session = pickSession(pairs, (s) => typeof s.expires_at === 'number');
  return session ? session.expires_at : null;
}

module.exports = {
  parseCookieHeader,
  isAuthCookieName,
  isCookieDeletion,
  applyCookieUpdates,
  stripAuthCookieDeletions,
  combineAuthChunks,
  combinedAuthCandidates,
  decodeSessionJson,
  sessionUserFromCookiePairs,
  tokenFromPairs,
  sessionTokenFromSources,
  authCookieExpiresAt,
};
