import { NextRequest, NextResponse } from 'next/server';
import { runDuePosts } from '@/lib/calendar-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The scheduler tick: posts whatever calendar post is due. Called every few minutes by the database
// scheduler (pg_cron) with CALENDAR_TICK_TOKEN, or by Vercel cron with CRON_SECRET. Approved posts go
// out at their time; with automatic posting on, so does everything else. Safe to call often: a post is
// claimed before it is sent, so it can never go out twice.
export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  try {
    const cron = process.env.CRON_SECRET;
    const tick = process.env.CALENDAR_TICK_TOKEN;
    const bearer = request.headers.get('authorization') ?? '';
    const token = request.headers.get('x-tick-token') ?? '';
    const ok = (cron && bearer === `Bearer ${cron}`) || (tick && token && token === tick);
    if (!cron && !tick) return NextResponse.json({ error: 'The scheduler is not configured' }, { status: 503 });
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(await runDuePosts());
  } catch (error) {
    console.error('Cron calendar error:', error);
    return NextResponse.json({ error: 'Run failed' }, { status: 500 });
  }
}
