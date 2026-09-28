import { createSupabaseServerClient } from './supabase/server';
import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import crypto from 'node:crypto';
import { parseCookieHeader, sessionTokenFromSources, isAuthCookieName } from './auth-cookies';

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
// async headers() store, cookies() store. The token itself is then chosen by
// sessionTokenFromSources: middleware's x-forwarded-cookie (raw cookie + any token
// refresh it performed on this request) beats the stale pre-refresh sources, so an
// expiry-window request verifies the refreshed token instead of the expired one.

export { createSupabaseServerClient };

async function sessionTokenFromRequest(request?: NextRequest): Promise<string | null> {
  // Each cookie source stays labelled so a null extraction can report what the
  // function actually saw instead of failing silently (the live 401 storm made
  // extraction-vs-refresh failures indistinguishable in the logs).
  const groups: { label: string; pairs: ReturnType<typeof parseCookieHeader> }[] = [];

  try {
    if (request) groups.push({ label: 'req', pairs: request.cookies.getAll() });
  } catch {
    // fall through to header sources
  }

  const forwarded =
    request?.headers.get('x-forwarded-cookie') ??
    null;
  if (forwarded) groups.push({ label: 'fwd', pairs: parseCookieHeader(forwarded) });

  const raw = request?.headers.get('cookie');
  if (raw) groups.push({ label: 'raw', pairs: parseCookieHeader(raw) });

  let headerStore: Headers | null = null;
  try {
    headerStore = await headers();
  } catch {
    headerStore = null;
  }
  if (headerStore) {
    const hfwd = headerStore.get('x-forwarded-cookie');
    if (hfwd) groups.push({ label: 'hfwd', pairs: parseCookieHeader(hfwd) });
    const hraw = headerStore.get('cookie');
    if (hraw) groups.push({ label: 'hraw', pairs: parseCookieHeader(hraw) });
  }

  try {
    const { cookies } = await import('next/headers');
    groups.push({ label: 'store', pairs: (await cookies()).getAll() });
  } catch {
    // no cookie store — fall through
  }

  const forwardedEffective =
    forwarded ?? headerStore?.get('x-forwarded-cookie') ?? null;
  const allPairs = groups.flatMap((g) => g.pairs);

  const token = sessionTokenFromSources(forwardedEffective, allPairs);

  if (!token) {
    const anyContent = groups.some((g) => g.pairs.length > 0);
    if (anyContent || forwardedEffective) {
      const report = groups
        .map(
          (g) =>
            `${g.label}=${g.pairs.filter((p: { name: string }) => isAuthCookieName(p.name)).length}/${g.pairs.length}`
        )
        .join(' ');
      const authNames = [
        ...new Set(
          allPairs
            .filter((p: { name: string }) => isAuthCookieName(p.name))
            .map((p: { name: string }) => p.name)
        ),
      ].join(',');
      console.warn(
        `[auth] no token extracted: ${report} fwdLen=${forwardedEffective?.length ?? 0} names=[${authNames}]`
      );
    }
  }

  return token;
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
    // Log the reason (Supabase's message only — never the token) so a 401 storm in the
    // Vercel logs says *why*: rejection here = the cookie held a token Auth no longer
    // accepts; no such line at all = the cookie never yielded a token (extraction).
    const status =
      typeof (error as { status?: unknown } | null)?.status === 'number'
        ? (error as { status: number }).status
        : 'n/a';
    console.warn(`[auth] getUser rejected: ${error?.message ?? 'no user returned'} (status ${status})`);
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
