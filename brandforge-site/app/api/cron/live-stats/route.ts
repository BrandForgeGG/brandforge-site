import { NextRequest, NextResponse } from 'next/server';
import { getRealStats } from '@/lib/project-db';
import { buildLiveStats } from '@/lib/digest.js';
import { postEverywhere } from '@/lib/ops-events';

export const dynamic = 'force-dynamic';

// Daily: one line of real numbers to Discord and the Telegram channel. Nothing on a quiet day.
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
    if ((request.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const stats = await getRealStats();
    const line = buildLiveStats(stats);
    if (!line) return NextResponse.json({ posted: false, reason: 'quiet_day', stats });
    const result = await postEverywhere(line);
    return NextResponse.json({ posted: true, line, result });
  } catch (error) {
    console.error('Cron live-stats error:', error);
    return NextResponse.json({ error: 'Cron run failed' }, { status: 500 });
  }
}
