import { createSupabaseServerClient } from './supabase/server';
import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import crypto from 'node:crypto';
import {
  parseCookieHeader,
  combineAuthChunks,
  decodeSessionJson,
} from './auth-cookies';

// Server-side Supabase access for API routes.
//
// SECURITY (C1): identity is NEVER taken from a decoded cookie or from x-user-* headers.
// Those are attacker-forgeable (any base64/JSON blob shaped like a session decodes into
// a chosen user id). Instead: pull the access_token out of the cookie session, then let
// Supabase verify it server-side with auth.getUser(token). That checks the JWT signature
// and expiry against the auth server and returns the canonical user — a forged cookie
// fails closed as 401.
//
// - getUser(token) with an explicit JWT never triggers a refresh, so it cannot race
//   refresh-token rotation (the old auto-signout bug) and never writes cookies
//   (createSupabaseServerClient.setAll is a no-op in route handlers).
// - Results are cached per token for 60s so polling routes do not pay a network hop
//   per request; staleness is bounded and revocation windows this short are acceptable
//   because the JWT itself was verified at store time.
// - No token in any cookie source = unauthenticated, no network call.
//
// On Vercel, NextRequest.cookies and cookies() are often empty in route handlers;
// cookie sources are merged: request cookies, x-forwarded-cookie, raw Cookie header,
// async headers() store, cookies() store.

export { createSupabaseServerClient };

type DecodedSession = { access_token?: unknown; refresh_token?: unknown } | null;

function pairsFromRequest(request?: NextRequest): ReturnType<typeof parseCookieHeader> {
  const pairs: ReturnType<typeof parseCookieHeader> = [];
  if (!request) return pairs;

  try {
    pairs.push(...request.cookies.getAll());
  } catch {
    // fall through to header sources
  }

  const forwarded = request.headers.get('x-forwarded-cookie');
  if (forwarded) pairs.push(...parseCookieHeader(forwarded));

  const raw = request.headers.get('cookie');
  if (raw) pairs.push(...parseCookieHeader(raw));

  return pairs;
}

function pairsFromHeaderStore(h: Headers): ReturnType<typeof parseCookieHeader> {
  const pairs: ReturnType<typeof parseCookieHeader> = [];
  const forwarded = h.get('x-forwarded-cookie');
  if (forwarded) pairs.push(...parseCookieHeader(forwarded));
  const raw = h.get('cookie');
  if (raw) pairs.push(...parseCookieHeader(raw));
  return pairs;
}

async function sessionTokenFromRequest(request?: NextRequest): Promise<string | null> {
  const pairs = pairsFromRequest(request);

  let headerStore: Headers | null = null;
  try {
    headerStore = await headers();
  } catch {
    headerStore = null;
  }
  if (headerStore) pairs.push(...pairsFromHeaderStore(headerStore));

  let storePairs: ReturnType<typeof parseCookieHeader> = [];
  try {
    const { cookies } = await import('next/headers');
    storePairs = (await cookies()).getAll();
  } catch {
    // no cookie store — fall through
  }
  pairs.push(...storePairs);

  const combined = combineAuthChunks(pairs);
  if (!combined) return null;

  const session = decodeSessionJson(combined) as DecodedSession;
  const token = session && typeof session.access_token === 'string' ? session.access_token : '';
  return token || null;
}

// Verified-token cache: token hash -> user. Bounded; cleared wholesale past the cap
// because a refresh re-issues tokens anyway and a cold miss costs one network call.
const VERIFY_CACHE_TTL_MS = 60_000;
const VERIFY_CACHE_MAX = 500;
const verifyCache = new Map<string, { user: User; expiresAt: number }>();

export async function getAuthenticatedUser(request?: NextRequest): Promise<User | null> {
  const token = await sessionTokenFromRequest(request);
  if (!token) return null;

  const cacheKey = crypto.createHash('sha256').update(token).digest('hex');
  const cached = verifyCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }
  verifyCache.delete(cacheKey);

  const supabase = await createSupabaseServerClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    // Expired or forged. The client refreshes its token on the next auth call and retries.
    return null;
  }

  if (verifyCache.size >= VERIFY_CACHE_MAX) verifyCache.clear();
  verifyCache.set(cacheKey, { user, expiresAt: now + VERIFY_CACHE_TTL_MS });

  return user;
}

export function getActorName(
  user?: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null
) {
  if (!user) {
    return 'BrandForge Founder';
  }

  const metadataName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '').trim();

  return metadataName || user.email?.split('@')[0] || 'BrandForge Founder';
}
