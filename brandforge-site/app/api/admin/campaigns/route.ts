import { NextRequest, NextResponse } from 'next/server';
import { createMarketingCampaign, isAdminAccount, listMarketingCampaigns } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { isValidUrl } from '@/lib/valid-url';

export const dynamic = 'force-dynamic';

const KINDS = new Set(['directory', 'launch', 'outreach', 'other']);
const STATUSES = new Set(['planned', 'in_progress', 'submitted', 'live', 'declined', 'skipped']);

const PENDING_MIGRATION =
  'Migration 0021_marketing_campaigns.sql has not been applied yet. Run it in the Supabase SQL editor.';

async function requireAdmin(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  if (!(await isAdminAccount(user.id))) {
    return { error: NextResponse.json({ error: 'Admin access only' }, { status: 403 }) };
  }
  return { user };
}

// GET /api/admin/campaigns — admin-only campaign list (service-role table).
export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if (gate.error) return gate.error;

    const result = await listMarketingCampaigns();
    if (!result.ok) {
      if (result.error === 'pending_migration') {
        return NextResponse.json({ error: PENDING_MIGRATION, pendingMigration: true }, { status: 503 });
      }
      return NextResponse.json(
        { error: result.error === 'not_configured' ? 'Service role key is not configured' : 'Failed to load campaigns' },
        { status: result.error === 'not_configured' ? 503 : 500 }
      );
    }

    return NextResponse.json({ campaigns: result.campaigns, counts: result.counts });
  } catch (error) {
    console.error('Admin campaigns list error:', error);
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 });
  }
}

// POST /api/admin/campaigns — create a tracked campaign.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if (gate.error) return gate.error;

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'A JSON body is required' }, { status: 400 });
    }

    const name = String(payload.name ?? '').trim();
    const kind = String(payload.kind ?? 'directory');
    const status = String(payload.status ?? 'planned');
    const category = typeof payload.category === 'string' && payload.category.trim() ? payload.category.trim() : null;
    const notes = typeof payload.notes === 'string' && payload.notes.trim() ? payload.notes.trim() : null;
    const targetUrl = typeof payload.targetUrl === 'string' && payload.targetUrl.trim() ? payload.targetUrl.trim() : null;
    const liveUrl = typeof payload.liveUrl === 'string' && payload.liveUrl.trim() ? payload.liveUrl.trim() : null;

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: 'name is too long (max 120)' }, { status: 400 });
    if (!KINDS.has(kind)) return NextResponse.json({ error: 'kind must be directory, launch, outreach or other' }, { status: 400 });
    if (!STATUSES.has(status)) return NextResponse.json({ error: 'unknown status' }, { status: 400 });
    if (targetUrl && !isValidUrl(targetUrl)) return NextResponse.json({ error: 'targetUrl must be a valid URL' }, { status: 400 });
    if (liveUrl && !isValidUrl(liveUrl)) return NextResponse.json({ error: 'liveUrl must be a valid URL' }, { status: 400 });

    const result = await createMarketingCampaign({
      name,
      kind,
      status,
      category,
      notes,
      targetUrl,
      liveUrl,
    });

    if (!result.ok) {
      if (result.error === 'pending_migration') {
        return NextResponse.json({ error: PENDING_MIGRATION, pendingMigration: true }, { status: 503 });
      }
      return NextResponse.json(
        { error: result.error === 'not_configured' ? 'Service role key is not configured' : 'Failed to create the campaign' },
        { status: result.error === 'not_configured' ? 503 : 500 }
      );
    }

    return NextResponse.json({ campaign: result.campaign }, { status: 201 });
  } catch (error) {
    console.error('Admin campaigns create error:', error);
    return NextResponse.json({ error: 'Failed to create the campaign' }, { status: 500 });
  }
}
