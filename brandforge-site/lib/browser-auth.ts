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
