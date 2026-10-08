import { NextRequest, NextResponse } from 'next/server';
import { getAdminOverview, getFunnelSummary, isAdminAccount } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { FUNNEL_EVENTS } from '@/lib/funnel.js';

export const dynamic = 'force-dynamic';

// GET /api/admin/overview: everything the dashboard shows in one read, real users only.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!(await isAdminAccount(user.id))) return NextResponse.json({ error: 'Admin access only' }, { status: 403 });

    const [overview, funnel] = await Promise.all([getAdminOverview(), getFunnelSummary()]);
    if (!overview) return NextResponse.json({ error: 'Service role key is not configured' }, { status: 503 });

    return NextResponse.json({
      ...overview,
      funnel: funnel
        ? { window: funnel.window, events: FUNNEL_EVENTS.map((event: string) => ({ event, count: funnel.counts.get(event) ?? 0 })) }
        : null,
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    return NextResponse.json({ error: 'Failed to load the dashboard' }, { status: 500 });
  }
}
