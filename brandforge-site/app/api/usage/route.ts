import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { usageBeat, usageSummary } from '@/lib/project-db';
import { checkRateLimit } from '@/lib/rate-limit';
import { analyticsAllowed } from '@/lib/consent.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { visitorId }: one heartbeat from an open, visible tab (about once a minute). Counted only for visitors who accepted
// measurement in the cookie choice; the database caps each beat so a forgotten tab is not counted as hours.
export async function POST(request: NextRequest) {
  if (!analyticsAllowed(request.headers.get('cookie') ?? '')) return NextResponse.json({ counted: false });
  const body = (await request.json().catch(() => ({}))) as { visitorId?: unknown };
  const visitorId = typeof body.visitorId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.visitorId) ? body.visitorId : null;
  if (!visitorId) return NextResponse.json({ counted: false }, { status: 400 });
  if (!checkRateLimit(`usage:${visitorId}`, { limit: 4, windowMs: 60 * 1000 }).allowed) return NextResponse.json({ counted: false }, { status: 429 });
  const user = await getAuthenticatedUser(request).catch(() => null);
  await usageBeat(visitorId, user?.id ?? null);
  return NextResponse.json({ counted: true });
}

// GET: the numbers on Explore (members, online now, time spent), plus your own time when signed in.
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  const summary = await usageSummary(user?.id ?? null);
  if (!summary) return NextResponse.json({ error: 'Not available right now.' }, { status: 503 });
  return NextResponse.json(
    {
      registered: Number(summary.registered) || 0,
      online: Number(summary.online) || 0,
      totalHours: Math.round((Number(summary.total_seconds) || 0) / 360) / 10,
      averageMinutesPerMember: summary.members_counted ? Math.round((Number(summary.member_seconds) || 0) / 60 / Number(summary.members_counted)) : 0,
      since: summary.since,
      yourMinutes: summary.mine === null ? null : Math.round(Number(summary.mine) / 60),
    },
    { headers: { 'Cache-Control': user ? 'private, no-store' : 'public, s-maxage=30, stale-while-revalidate=60' } },
  );
}
