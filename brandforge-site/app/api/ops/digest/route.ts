import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { isAdminAccount, getWeeklyStats } from '@/lib/project-db';
import { buildWeeklyDigest } from '@/lib/digest';
import { postLiveMessage } from '@/lib/ops-events';

export const dynamic = 'force-dynamic';

// Weekly growth digest (phase 2 of the webhook spec). Admin-only, manual trigger
// until a cron calls it: GET previews the numbers + text, POST sends the text to
// the public live feed (no-op without DISCORD_LIVE_URL). Counts only — the text
// can never leak names, amounts or titles.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!(await isAdminAccount(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const stats = await getWeeklyStats();
    return NextResponse.json({ ...stats, text: buildWeeklyDigest(stats) });
  } catch (error) {
    console.error('Digest preview error:', error);
    return NextResponse.json({ error: 'Failed to build digest' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!(await isAdminAccount(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const stats = await getWeeklyStats();
    const text = buildWeeklyDigest(stats);
    const send = await postLiveMessage(text);
    return NextResponse.json({ ...stats, text, send });
  } catch (error) {
    console.error('Digest send error:', error);
    return NextResponse.json({ error: 'Failed to send digest' }, { status: 500 });
  }
}
