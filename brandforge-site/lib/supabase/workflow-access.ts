import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from './server';

type WorkflowSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function getAccessibleProjectIds(
  supabase: WorkflowSupabase,
  userId: string
) {
  const [ownedResult, membershipResult] = await Promise.all([
    supabase.from('projects').select('id').eq('owner_id', userId),
    supabase.from('project_members').select('project_id').eq('user_id', userId),
  ]);

  const directIds = (ownedResult.data ?? []).map((row: { id: string }) => row.id);
  const memberIds = (membershipResult.data ?? []).map((row: { project_id: string }) => row.project_id);
  return Array.from(new Set([...directIds, ...memberIds]));
}

export function getActorDisplayName(user: User | null | undefined) {
  if (!user) {
    return 'BrandForge Team';
  }

  const metadataName = String(
    user.user_metadata?.full_name ?? user.user_metadata?.name ?? ''
  ).trim();

  return metadataName || user.email?.split('@')[0] || 'BrandForge Team';
}
