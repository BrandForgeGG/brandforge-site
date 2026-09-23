import { createSupabaseServerClient } from './supabase/server';
import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { parseCookieHeader, sessionUserFromCookiePairs } from './auth-cookies';

// Server-side Supabase access for API routes.
//
// BrandForge stores every message, requirement, estimate and milestone through Postgres
// row level security, so server code must run as the signed-in founder. The request
// cookies carry the Supabase session, which is why every helper here builds a fresh
// request-scoped client instead of reusing the anonymous browser client.
//
// The middleware (proxy.ts) passes authenticated user info via request headers
// (x-user-id, x-user-email, x-user-name) when it can read the session from cookies.
// Prefer those headers — getUser() on every API call races refresh-token rotation
// and was signing users out mid-session.
//
// On Vercel, NextRequest.cookies and cookies() are often empty in route handlers;
// the working source is next/headers() → x-forwarded-cookie / cookie (same path
// project-db already uses). Identity resolution (all local — never network getUser):
//   1. x-user-* on the request, then on async headers()
//   2. decode chunked base64url auth-token from request cookies, then headers()
//   3. cookies() store, then supabase.auth.getSession()

export { createSupabaseServerClient };

function userFromHeaderValues(
  headerUserId: string | null,
  headerEmail: string | null,
  headerName: string | null
): User | null {
  // Email can be missing on some federated logins; id alone is enough for RLS.
  if (!headerUserId) return null;

  return {
    id: headerUserId,
    email: headerEmail ?? '',
    user_metadata: { full_name: headerName ?? '' },
    app_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as unknown as User;
}

function userFromHeaderStore(h: Headers): User | null {
  return userFromHeaderValues(h.get('x-user-id'), h.get('x-user-email'), h.get('x-user-name'));
}

function userFromRequest(request?: NextRequest): User | null {
  if (!request) return null;
  return userFromHeaderStore(request.headers);
}

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

function userFromCookiePairs(pairs: ReturnType<typeof parseCookieHeader>): User | null {
  if (pairs.length === 0) return null;
  return sessionUserFromCookiePairs(pairs) as unknown as User | null;
}

export async function getAuthenticatedUser(request?: NextRequest): Promise<User | null> {
  const fromRequestHeaders = userFromRequest(request);
  if (fromRequestHeaders) return fromRequestHeaders;

  let headerStore: Headers | null = null;
  try {
    headerStore = await headers();
  } catch {
    headerStore = null;
  }

  if (headerStore) {
    const fromAsyncHeaders = userFromHeaderStore(headerStore);
    if (fromAsyncHeaders) return fromAsyncHeaders;

    // Primary Vercel path: middleware-forwarded Cookie header on headers().
    const fromHeaderStoreCookies = userFromCookiePairs(pairsFromHeaderStore(headerStore));
    if (fromHeaderStoreCookies) return fromHeaderStoreCookies;
  }

  const fromRequestCookies = userFromCookiePairs(pairsFromRequest(request));
  if (fromRequestCookies) return fromRequestCookies;

  try {
    const { cookies } = await import('next/headers');
    const store = await cookies();
    const fromStore = userFromCookiePairs(store.getAll());
    if (fromStore) return fromStore;
  } catch {
    // no cookie store — fall through
  }

  // Fallback: local session only (no network getUser).
  const supabase = await createSupabaseServerClient(request);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return null;
  }

  return session.user;
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
