import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-only Supabase client that runs as the service role.
//
// Two jobs need to bypass row level security:
//   1. Owner-scoped deletes. Deleting a conversation must remove its child rows (messages,
//      requirements, proposals, milestones, agreements, payments, tasks, participants), which the
//      signed-in user has no DELETE policy for even though the rows are theirs.
//   2. Platform-wide counters (registered accounts, BrandForge staff), because RLS only exposes
//      the signed-in account's own profile row.
//
// Every caller verifies ownership/authority with the user-scoped client first and only then uses
// this client for the privileged step. Returns null when the key is not configured so routes can
// answer with a clear error instead of silently failing.
//
// Never import this module into a client component.
export function createSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
