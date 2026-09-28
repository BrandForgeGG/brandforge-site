import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Prefer the local session for page-level identity. getUser() hits the Auth
// server and can rotate refresh tokens — parallel getUser() calls from
// dashboard + settings + rail were racing and signing users out.
export async function getSessionUser(): Promise<User | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}

export async function getSessionEmail(): Promise<string | null> {
  const user = await getSessionUser();
  return user?.email ?? null;
}

// One redirect per page load: parallel 401s must not queue several assigns, and a
// full navigation (which re-runs this module) re-arms the flag for the next death.
const AUTH_REDIRECT_KEY = 'brandforge:auth-redirected';
if (typeof window !== 'undefined') {
  try {
    window.sessionStorage.removeItem(AUTH_REDIRECT_KEY);
  } catch {
    // Storage blocked — the pathname guard below still prevents loops.
  }
}

// Authenticated fetch: on a 401, force one client-side session refresh and retry
// once. This covers the expiry window where the access token died between page
// load and the click — middleware refreshes server-side too, but a concurrent
// browser refresh can win the rotation race and leave that first response 401.
// The supabase singleton shares one in-flight refresh, so parallel 401s (rail +
// workspace polling together) trigger exactly one rotation, and the retried
// request goes out with the refreshed cookie.
//
// When there is nothing left to refresh, the failure type decides: network,
// rate limit or 5xx keeps the original 401 (transient — callers show their
// normal error), but an auth-side rejection means the session is dead (revoked
// refresh family, no session at all) — park on /login instead of leaving the
// shell to 401 forever. /login redirects straight back to /chat when a live
// session does exist, so a misfire self-heals with one reload.
export async function fetchAuthed(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401) return response;

  try {
    const { data, error } = await supabase.auth.refreshSession();

    if (data.session) {
      return await fetch(input, init);
    }

    const status =
      typeof (error as { status?: unknown } | null)?.status === 'number'
        ? (error as { status: number }).status
        : null;
    const transient =
      status !== null && (status === 0 || status === 429 || status >= 500);

    if (
      !transient &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login'
    ) {
      let alreadyRedirected = false;
      try {
        alreadyRedirected =
          window.sessionStorage.getItem(AUTH_REDIRECT_KEY) === '1';
        if (!alreadyRedirected) {
          window.sessionStorage.setItem(AUTH_REDIRECT_KEY, '1');
        }
      } catch {
        alreadyRedirected = false; // storage blocked — pathname guard only
      }
      if (!alreadyRedirected) {
        // Hard navigation on purpose: this module runs outside React (no router),
        // and a full page load also kills the zombie shell's polling intervals.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/login');
      }
    }

    return response;
  } catch {
    return response;
  }
}
