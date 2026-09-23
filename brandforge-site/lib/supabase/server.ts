import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';

type CookiePair = { name: string; value: string };

function parseCookieHeader(raw: string | null | undefined): CookiePair[] {
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
    .filter((c): c is CookiePair => c !== null);
}

function readCookies(request?: NextRequest): CookiePair[] {
  if (!request) return [];

  // 1. NextRequest.cookies (works in middleware, sometimes empty in route handlers)
  try {
    const fromRequestCookies = request.cookies.getAll();
    if (fromRequestCookies.length > 0) return fromRequestCookies;
  } catch {
    // fall through
  }

  // 2. Middleware-forwarded raw cookie string
  const forwarded = request.headers.get('x-forwarded-cookie');
  if (forwarded) {
    const parsed = parseCookieHeader(forwarded);
    if (parsed.length > 0) return parsed;
  }

  // 3. Raw Cookie header directly on the request
  const rawCookie = request.headers.get('cookie');
  if (rawCookie) {
    const parsed = parseCookieHeader(rawCookie);
    if (parsed.length > 0) return parsed;
  }

  return [];
}

// Async cookies() store — on Vercel route handlers request.cookies can be empty
// even when the browser sent a full Cookie header.
async function readAsyncCookies(): Promise<CookiePair[]> {
  try {
    const { cookies, headers } = await import('next/headers');
    const headerStore = await headers();
    const forwarded =
      headerStore.get('x-forwarded-cookie') ?? headerStore.get('cookie') ?? '';
    if (forwarded) {
      const parsed = parseCookieHeader(forwarded);
      if (parsed.length > 0) return parsed;
    }
    const store = await cookies();
    return store.getAll();
  } catch {
    return [];
  }
}

export async function createSupabaseServerClient(request?: NextRequest) {
  let allCookies = readCookies(request);
  if (allCookies.length === 0) {
    allCookies = await readAsyncCookies();
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    {
      cookieEncoding: 'base64url',
      cookies: {
        getAll() {
          return allCookies;
        },
        setAll() {
          // Route handlers cannot write cookies; middleware/callback own that.
        },
      },
    }
  );
}
