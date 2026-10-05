import type { NextRequest, NextResponse } from 'next/server';
import { blueprintConfig } from './blueprint-config';
import { createSessionToken, hashIp, sessionCookieOptions, verifySessionToken } from './blueprint-session';
import { checkRateLimit } from './rate-limit';
import {
  countBlueprintSessionsSince,
  createBlueprintSession,
  getBlueprintSession,
} from './project-db';

// Anonymous guest sessions for the chat-first flow (slice A).
//
// A guest IS a blueprint session: the same opaque `bf_bp` HMAC cookie the
// Blueprint Engine already mints, now also owning conversations
// (conversations.owner_session_id). Nothing here trusts the cookie alone —
// resolveGuestSession always confirms the row still exists, and routes then
// check the session owns the specific conversation before touching it.
//
// The companion `bf_guest` cookie is deliberately NOT HttpOnly: lib/browser-auth
// reads it to tell "this browser is in guest mode" apart from "the session died",
// so a 401 from a guest-incompatible endpoint never parks the visitor on /login.

export const GUEST_MARKER_COOKIE = 'bf_guest';
const GUEST_MINT_RATE_LIMIT = { limit: 6, windowMs: 60_000 };
const GUEST_SESSION_RETENTION_DAYS = 90;

export type GuestSession = { sessionId: string };

function guestEnabled(): boolean {
  const config = blueprintConfig();
  return config.enabled && Boolean(config.sessionSecret);
}

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

// Offline HMAC verification + row lookup. Returns null for a missing, forged
// or stale cookie — callers map that to 401 exactly like a signed-out user.
export async function resolveGuestSession(request: NextRequest): Promise<GuestSession | null> {
  if (!guestEnabled()) return null;

  const config = blueprintConfig();
  const cookie = request.cookies.get(config.sessionCookieName)?.value ?? null;
  const sessionId = verifySessionToken(cookie, config.sessionSecret);
  if (!sessionId) return null;

  const existing = await getBlueprintSession(sessionId);
  if (!existing.ok || !existing.session) return null;

  return { sessionId };
}

export type EnsureGuestResult =
  | { ok: true; sessionId: string; minted: boolean }
  | { ok: false; status: number; error: string; retryAfterSeconds?: number };

// Resolve the caller's session, minting one when the browser has none. The
// mint path mirrors blueprint/start: per-IP rate limit, durable per-IP hourly
// cap (clearing cookies does not reset it), salted IP hash, 90-day retention.
export async function ensureGuestSession(request: NextRequest): Promise<EnsureGuestResult> {
  const existing = await resolveGuestSession(request);
  if (existing) return { ok: true, sessionId: existing.sessionId, minted: false };

  if (!guestEnabled()) {
    return { ok: false, status: 503, error: 'Guest sessions are not configured.' };
  }

  // Per-IP rate limit on minting: resolution above is cookie + one read, this
  // is the path that writes a row.
  const ip = clientIp(request);
  const rate = checkRateLimit(`guest:mint:${ip}`, GUEST_MINT_RATE_LIMIT);
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      error: 'Too many requests, slow down.',
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }

  const config = blueprintConfig();
  const ipHash = hashIp(ip, config.sessionSecret);

  if (ipHash) {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const perIp = await countBlueprintSessionsSince(ipHash, since);
    if (!perIp.ok) {
      return { ok: false, status: 503, error: guestDbErrorMessage(perIp.error) };
    }
    if (perIp.count >= config.maxSessionsPerIpPerHour) {
      return {
        ok: false,
        status: 429,
        error: 'Session limit reached, try again later.',
        retryAfterSeconds: 3600,
      };
    }
  }

  const created = await createBlueprintSession({
    ipHash,
    retentionDays: GUEST_SESSION_RETENTION_DAYS,
  });
  if (!created.ok) {
    return { ok: false, status: 503, error: guestDbErrorMessage(created.error) };
  }

  return { ok: true, sessionId: created.session.id, minted: true };
}

function guestDbErrorMessage(error: 'not_configured' | 'pending_migration' | 'failed'): string {
  if (error === 'pending_migration') {
    return 'Guest chat storage is not set up yet. Has migration 0023 been applied?';
  }
  if (error === 'not_configured') {
    return 'Guest chat storage is not configured.';
  }
  return 'Could not start a guest session right now.';
}

// Both cookies travel together: HttpOnly bf_bp (identity) + readable bf_guest
// (client marker). Refreshed on every guest conversation write so an active
// visitor keeps a live session.
export function attachGuestCookies(response: NextResponse, sessionId: string): void {
  const config = blueprintConfig();

  response.cookies.set(
    config.sessionCookieName,
    createSessionToken(sessionId, config.sessionSecret),
    sessionCookieOptions(config.sessionTtlDays)
  );
  response.cookies.set(GUEST_MARKER_COOKIE, '1', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(1, config.sessionTtlDays) * 86400,
  });
}
