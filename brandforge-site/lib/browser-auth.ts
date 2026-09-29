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

// Terminal handling for an unusable session: park on /login instead of
// leaving the shell to 401 forever. Network, rate limit or 5xx during the
// refresh itself is transient (callers keep their normal error), but a
// refused request after a *successful* refresh means the session cannot
// work — same verdict as an auth-side rejection. /login redirects straight
// back to /chat when middleware still holds a live session, so a misfire
// self-heals with one reload; a persistent disagreement reloads visibly
// instead of 401-ing silently.
function parkOnLogin(): void {
  if (typeof window === 'undefined' || window.location.pathname === '/login') return;
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

// Authenticated fetch: on a 401, force one client-side session refresh and retry
// once. This covers the expiry window where the access token died between page
// load and the click — middleware refreshes server-side too, but a concurrent
// browser refresh can win the rotation race and leave that first response 401.
// The supabase singleton shares one in-flight refresh, so parallel 401s (rail +
// workspace polling together) trigger exactly one rotation, and the retried
// request goes out with the refreshed cookie.
//
// Every attempt is time-boxed: without a timeout a stalled request hangs the
// caller's button forever (a stuck "Sending…" with no error and no retry). A
// timeout surfaces as a normal error the caller already knows how to show.
//
// If that retry comes back 401 *after* a successful refresh, there is nothing
// left to try: the server has rejected a token that just rotated, so we warn
// (path only) and park on /login via the same terminal path as a failed refresh
// — never a second silent 401 loop.
const FETCH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function refreshWithTimeout() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // supabase-js exposes no abort handle for refresh, so race it: a late success
    // still rotates the shared session in the background, which is harmless.
    return await Promise.race([
      supabase.auth.refreshSession(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Session refresh timed out')),
          FETCH_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function fetchAuthed(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetchWithTimeout(input, init);
  if (response.status !== 401) return response;

  try {
    const { data, error } = await refreshWithTimeout();

    if (data.session) {
      const retry = await fetchWithTimeout(input, init);
      if (retry.status !== 401) return retry;
      console.warn(
        `fetchAuthed: still 401 after refresh on ${window.location.pathname}`,
      );
      parkOnLogin();
      return retry;
    }

    const status =
      typeof (error as { status?: unknown } | null)?.status === 'number'
        ? (error as { status: number }).status
        : null;
    const transient =
      status !== null && (status === 0 || status === 429 || status >= 500);

    if (!transient) parkOnLogin();

    return response;
  } catch {
    return response;
  }
}
