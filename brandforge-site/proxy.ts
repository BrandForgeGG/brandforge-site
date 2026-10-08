import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  applyCookieUpdates,
  authCookieExpiresAt,
  sessionUserFromCookiePairs,
  stripAuthCookieDeletions,
} from '@/lib/auth-cookies';
import { blueprintConfig } from '@/lib/blueprint-config';
import { verifySessionToken } from '@/lib/blueprint-session';

type AuthCookieUpdate = {
  name: string;
  value: string;
  options?: Parameters<NextResponse['cookies']['set']>[2];
};

const protectedRoutes = [
  '/chat',
  '/settings',
  '/admin',
  '/onboarding',
];

// Anonymous guest chat: an /chat page may render when the request carries a
// cryptographically valid bf_bp blueprint-session cookie. Checked offline
// (HMAC only — no database round-trip from the proxy); the API routes still
// re-resolve the session row and enforce ownership per conversation. Every
// other protected route keeps requiring a signed-in user.
function hasGuestChatAccess(request: NextRequest, pathname: string): boolean {
  if (pathname !== '/chat' && !pathname.startsWith('/chat/')) return false;
  const config = blueprintConfig();
  if (!config.enabled || !config.sessionSecret) return false;
  const token = request.cookies.get(config.sessionCookieName)?.value ?? null;
  return Boolean(verifySessionToken(token, config.sessionSecret));
}

export default async function proxy(request: NextRequest) {
  const cookieUpdates: AuthCookieUpdate[] = [];
  const responseHeadersFromAuth: Record<string, string> = {};
  const originalCookies = request.cookies.getAll();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    {
      // Must match createBrowserClient (default base64url). raw vs base64url
      // mismatch => session unreadable => middleware bounces to /login.
      cookieEncoding: 'base64url',
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Persist token refresh on the outgoing response. A no-op here is what
          // caused forced logouts once the access token expired.
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieUpdates.push({ name, value, options });
          });
          if (headers) {
            Object.assign(responseHeadersFromAuth, headers);
          }
        },
      },
    }
  );

  // Local session only. getUser() hits the Auth server, races refresh-token
  // rotation across parallel middleware/API work, and is what kept signing
  // people out after the first getSession() fix.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // getSession() can miss under a refresh race while the browser still holds
  // auth cookies. Decode those cookies so API routes still get x-user-*.
  const cookieUser = sessionUserFromCookiePairs(originalCookies);

  // A cookie that decodes but whose access token is expired AND could not be
  // refreshed (getSession() above returned no session) is a DEAD session: C1
  // route gating rejects every API call with 401, so rendering the shell would
  // park the user in a zombie app — worse, this gate would even bounce them
  // back from /login into it. Expired + unrefreshable now means /login.
  // Unknown expiry stays lenient (never lock out over a cookie-shape change),
  // and an unexpired JWT keeps the old behaviour: a transient refresh miss
  // under a rotation race must not sign anybody out (auto-signout bug).
  const cookieExpiresAt = authCookieExpiresAt(originalCookies);
  const cookieAlive =
    cookieUser !== null &&
    (cookieExpiresAt === null || cookieExpiresAt * 1000 > Date.now());
  const user = session?.user ?? (cookieAlive ? cookieUser : null);
  const hasValidUser = Boolean(user);

  // Never wipe an existing browser session from middleware on a failed refresh —
  // only /auth/signout may do that. Successful refresh (new auth cookies in the
  // same setAll batch) is allowed through so chunked cookies can rotate.
  const safeCookieUpdates = stripAuthCookieDeletions(
    originalCookies,
    cookieUpdates
  ) as AuthCookieUpdate[];

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Forward cookies (including this request's refresh) to route handlers. On Vercel,
  // request.cookies and cookies() can both come back empty in API routes even though
  // the browser sent the Cookie header.
  const rawCookie = request.headers.get('cookie') ?? '';
  const forwardedCookie = applyCookieUpdates(rawCookie, safeCookieUpdates);
  const modifiedHeaders = new Headers(request.headers);

  // Never trust identity that arrived with the request. Route handlers read these headers as the
  // authenticated user (lib/supabase-server.ts), so anything the client sent must be removed before
  // this middleware sets the values it verified itself. H6.
  modifiedHeaders.delete('x-user-id');
  modifiedHeaders.delete('x-user-email');
  modifiedHeaders.delete('x-user-name');
  modifiedHeaders.delete('x-forwarded-cookie');

  if (forwardedCookie) {
    modifiedHeaders.set('x-forwarded-cookie', forwardedCookie);
  }
  if (hasValidUser && user) {
    modifiedHeaders.set('x-user-id', user.id);
    modifiedHeaders.set('x-user-email', user.email ?? '');
    modifiedHeaders.set(
      'x-user-name',
      user.user_metadata?.full_name ?? user.user_metadata?.name ?? ''
    );
  }

  function withAuthCookies(response: NextResponse) {
    safeCookieUpdates.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    Object.entries(responseHeadersFromAuth).forEach(([key, value]) => {
      if (!response.headers.has(key)) {
        response.headers.set(key, value);
      }
    });
    return response;
  }

  const response = withAuthCookies(
    NextResponse.next({
      request: {
        headers: modifiedHeaders,
      },
    })
  );

  if (isProtectedRoute && !hasValidUser) {
    if (!hasGuestChatAccess(request, pathname)) {
      return withAuthCookies(NextResponse.redirect(new URL('/login', request.url)));
    }
  }

  if ((pathname === '/login' || pathname === '/signup') && hasValidUser) {
    return withAuthCookies(NextResponse.redirect(new URL('/chat', request.url)));
  }

  // Legacy /signup links now land on the split sign-in page.
  if (pathname === '/signup') {
    return withAuthCookies(NextResponse.redirect(new URL('/login', request.url)));
  }

  return response;
}

export const config = {
  matcher: [
    '/chat/:path*',
    '/settings/:path*',
    '/apply',
    '/admin/:path*',
    '/onboarding',
    '/login',
    '/signup',
    '/api/:path*',
  ],
};
