import { NextRequest, NextResponse } from 'next/server';
import { isAdminAccount, updateMarketingCampaign } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { isValidUrl } from '@/lib/valid-url';

export const dynamic = 'force-dynamic';

const KINDS = new Set(['directory', 'launch', 'outreach', 'other']);
const STATUSES = new Set(['planned', 'in_progress', 'submitted', 'live', 'declined', 'skipped']);

const PENDING_MIGRATION =
  'Migration 0021_marketing_campaigns.sql has not been applied yet. Run it in the Supabase SQL editor.';

// PATCH /api/admin/campaigns/[id] — update tracked fields of one campaign.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!(await isAdminAccount(user.id))) {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || id.length > 64) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 });

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'A JSON body is required' }, { status: 400 });
    }

    const patch: Parameters<typeof updateMarketingCampaign>[1] = {};

    if (payload.name !== undefined) {
      const name = String(payload.name).trim();
      if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      if (name.length > 120) return NextResponse.json({ error: 'name is too long (max 120)' }, { status: 400 });
      patch.name = name;
    }
    if (payload.kind !== undefined) {
      const kind = String(payload.kind);
      if (!KINDS.has(kind)) return NextResponse.json({ error: 'kind must be directory, launch, outreach or other' }, { status: 400 });
      patch.kind = kind;
    }
    if (payload.status !== undefined) {
      const status = String(payload.status);
      if (!STATUSES.has(status)) return NextResponse.json({ error: 'unknown status' }, { status: 400 });
      patch.status = status;
      if (status === 'submitted' || status === 'live') {
        const previous = payload.previousStatus ? String(payload.previousStatus) : null;
        if (previous !== 'submitted' && previous !== 'live') patch.submitted_at = new Date().toISOString();
      }
    }
    for (const field of ['category', 'notes'] as const) {
      if (payload[field] !== undefined) {
        const value = String(payload[field] ?? '').trim();
        patch[field] = value ? value : null;
      }
    }
    for (const field of ['targetUrl', 'liveUrl'] as const) {
      if (payload[field] !== undefined) {
        const column = field === 'targetUrl' ? 'target_url' : 'live_url';
        const value = String(payload[field] ?? '').trim();
        if (value && !isValidUrl(value)) {
          return NextResponse.json({ error: `${field} must be a valid URL` }, { status: 400 });
        }
        patch[column] = value ? value : null;
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No changes were provided' }, { status: 400 });
    }

    const result = await updateMarketingCampaign(id, patch);

    if (!result.ok) {
      if (result.error === 'pending_migration') {
        return NextResponse.json({ error: PENDING_MIGRATION, pendingMigration: true }, { status: 503 });
      }
      if (result.error === 'not_found') {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: result.error === 'not_configured' ? 'Service role key is not configured' : 'Failed to update the campaign' },
        { status: result.error === 'not_configured' ? 503 : 500 }
      );
    }

    return NextResponse.json({ campaign: result.campaign });
  } catch (error) {
    console.error('Admin campaigns update error:', error);
    return NextResponse.json({ error: 'Failed to update the campaign' }, { status: 500 });
  }
}
