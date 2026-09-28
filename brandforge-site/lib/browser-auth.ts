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

// Authenticated fetch: on a 401, force one client-side session refresh and retry
// once. This covers the expiry window where the access token died between page
// load and the click — middleware refreshes server-side too, but a concurrent
// browser refresh can win the rotation race and leave that first response 401.
// The supabase singleton shares one in-flight refresh, so parallel 401s (rail +
// workspace polling together) trigger exactly one rotation, and the retried
// request goes out with the refreshed cookie. Nothing to refresh (signed out)
// or a failed refresh returns the original 401 untouched for callers to handle.
export async function fetchAuthed(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401) return response;

  try {
    const { data } = await supabase.auth.refreshSession();
    if (!data.session) return response;
    return await fetch(input, init);
  } catch {
    return response;
  }
}
