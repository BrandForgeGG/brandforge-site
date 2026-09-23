import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import type { BrandForgeApproval } from '@/lib/brandforge-data';

export const dynamic = 'force-dynamic';

function normalizeApprovalStatus(value: string | null | undefined): BrandForgeApproval['status'] {
  const normalized = String(value ?? 'PENDING').trim().toUpperCase();

  if (normalized === 'APPROVED') return 'APPROVED';
  if (normalized === 'CHANGES_REQUESTED' || normalized === 'CHANGES-REQUESTED') return 'CHANGES_REQUESTED';
  return 'PENDING';
}

type ApprovalRow = {
  id: string;
  project_id: string;
  milestone?: string | null;
  status?: string | null;
  owner?: string | null;
  updated_at?: string | null;
  comment?: string | null;
};

function mapApprovalRow(row: ApprovalRow): BrandForgeApproval {
  return {
    id: row.id,
    projectId: row.project_id,
    milestone: row.milestone ?? 'Current milestone',
    status: normalizeApprovalStatus(row.status),
    owner: row.owner ?? 'BrandForge Team',
    updatedAt: row.updated_at ? new Date(row.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Now',
    comment: row.comment ?? 'No update recorded yet.',
  };
}

async function getAccessibleProjectIds(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const [ownedResult, membershipResult] = await Promise.all([
    supabase.from('projects').select('id').eq('owner_id', userId),
    supabase.from('project_members').select('project_id').eq('user_id', userId),
  ]);

  const directIds = (ownedResult.data ?? []).map((row: { id: string }) => row.id);
  const memberIds = (membershipResult.data ?? []).map((row: { project_id: string }) => row.project_id);
  return Array.from(new Set([...directIds, ...memberIds]));
}

async function loadApprovalsFromSupabase(request: NextRequest): Promise<BrandForgeApproval[] | null> {
  const supabase = await createSupabaseServerClient(request);
  const userData = await getAuthenticatedUser(request);

  if (!userData) {
    return null;
  }

  const accessibleProjectIds = await getAccessibleProjectIds(supabase, userData.id);
  if (accessibleProjectIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('project_approvals')
    .select('id, project_id, milestone, status, owner, updated_at, comment')
    .in('project_id', accessibleProjectIds)
    .order('updated_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map(mapApprovalRow);
}

export async function GET(request: NextRequest) {
  const userData = await getAuthenticatedUser(request);

  if (!userData) {
    return NextResponse.json({ approvals: [], error: 'Authentication required.' }, { status: 401 });
  }

  const liveApprovals = await loadApprovalsFromSupabase(request);
  return NextResponse.json({
    approvals: Array.isArray(liveApprovals) ? liveApprovals : [],
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const projectId = String(body.projectId ?? '').trim();
  const milestone = String(body.milestone ?? 'Current milestone').trim() || 'Current milestone';
  const status = normalizeApprovalStatus(body.status);
  const owner = String(body.owner ?? 'BrandForge Team').trim() || 'BrandForge Team';
  const comment = String(body.comment ?? 'No update recorded yet.').trim() || 'No update recorded yet.';

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient(request);
    const userData = await getAuthenticatedUser(request);

    if (!userData) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const accessibleProjectIds = await getAccessibleProjectIds(supabase, userData.id);
    if (!accessibleProjectIds.includes(projectId)) {
      return NextResponse.json({ error: 'Project access denied.' }, { status: 403 });
    }

    const { data: existingRows } = await supabase
      .from('project_approvals')
      .select('id, project_id, milestone, status, owner, updated_at, comment')
      .eq('project_id', projectId)
      .eq('milestone', milestone)
      .limit(1);

    const timestamp = new Date().toISOString();

    if (existingRows && existingRows.length > 0) {
      const existing = existingRows[0];
      const { data, error } = await supabase
        .from('project_approvals')
        .update({
          status,
          owner,
          comment,
          updated_at: timestamp,
        })
        .eq('id', existing.id)
        .select('id, project_id, milestone, status, owner, updated_at, comment')
        .single();

      if (!error && data) {
        return NextResponse.json({ approval: mapApprovalRow(data) });
      }
    }

    const { data, error } = await supabase
      .from('project_approvals')
      .insert({
        project_id: projectId,
        milestone,
        status,
        owner,
        comment,
        updated_at: timestamp,
      })
      .select('id, project_id, milestone, status, owner, updated_at, comment')
      .single();

    if (!error && data) {
      return NextResponse.json({ approval: mapApprovalRow(data) });
    }

    return NextResponse.json({ error: 'Approval could not be saved.' }, { status: 500 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to save approval.',
    }, { status: 500 });
  }
}
