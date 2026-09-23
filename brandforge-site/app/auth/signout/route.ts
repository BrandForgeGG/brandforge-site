import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function clearSessionAndRedirect(request: Request) {
  // The redirect response itself must carry the cleared cookies: writing to the
  // cookies() store and then returning a fresh NextResponse would leave the old
  // session intact, so sign-out (and account switching) silently failed.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: new URL('/', request.url).toString() },
  });
  const cookieStore = await cookies();
  let lastHeaders: Record<string, string> = {};

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
            response.cookies.set(name, value, options as CookieOptions);
          });
          lastHeaders = headers ?? {};
        },
      },
    }
  );

  await supabase.auth.signOut();

  Object.entries(lastHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

// GET must not clear the session. Next.js Link prefetch (and stray navigations)
// used to hit this route and wipe cookies while the user clicked Settings or
// Recents. Intentional sign-out is POST-only (or client supabase.auth.signOut).
export async function GET(request: Request) {
  return NextResponse.redirect(new URL('/', request.url), 303);
}

export async function POST(request: Request) {
  return clearSessionAndRedirect(request);
}
