import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const nextParam = requestUrl.searchParams.get('next') ?? '/chat';
  const next = nextParam.startsWith('/') ? nextParam : '/chat';
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  if (errorParam) {
    const loginUrl = new URL('/login', requestUrl.origin);
    if (errorDescription) {
      loginUrl.searchParams.set('error', errorDescription);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Session cookies must be attached to the redirect response itself. Writing them to the
  // cookies() store and then returning a fresh NextResponse drops them, so the browser came
  // back from Google without a session and bounced straight to /login.
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  let lastHeaders: Record<string, string> = {};
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    {
      cookieEncoding: 'base64url',
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            pendingCookies.push({ name, value, options });
          });
          lastHeaders = headers ?? {};
        },
      },
    }
  );

  function redirectWithCookies(url: URL) {
    const response = new NextResponse(null, { status: 308, headers: { Location: url.toString() } });
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    Object.entries(lastHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }

  console.log('OAuth callback start', {
    hasCode: Boolean(code),
    requestCookies: cookieStore.getAll().map((entry) => entry.name),
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  console.log('OAuth exchange result', {
    ok: !error,
    error: error?.message ?? null,
    cookiesToSet: pendingCookies.map((entry) => entry.name),
  });

  if (error) {
    console.error('OAuth callback exchange failed:', error.message);
    // Still carry the pending cookie mutations (verifier cleanup) so a failed exchange does
    // not leave a stale code_verifier behind for the next attempt.
    return redirectWithCookies(new URL('/login', request.url));
  }

  // Open auth: any Google account that completes OAuth keeps the session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.warn('OAuth callback: exchange succeeded but no user returned');
    return redirectWithCookies(new URL('/login', request.url));
  }

  const redirectUrl = new URL(next, requestUrl.origin);
  console.log('OAuth callback success', { email: user.email, redirect: next });
  return redirectWithCookies(redirectUrl);
}
