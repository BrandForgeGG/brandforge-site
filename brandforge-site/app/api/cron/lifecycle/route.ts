import { NextRequest, NextResponse } from 'next/server';
import { runLifecycle } from '@/lib/lifecycle-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The daily email-sequence run. Called once a day by the database scheduler with CALENDAR_TICK_TOKEN
// (or by Vercel cron with CRON_SECRET). Add ?dry=1 to see who would be emailed without sending
// anything. Real sends need LIFECYCLE_ENABLED=true in the environment.
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
    return NextResponse.json(await runLifecycle({ forceDry: request.nextUrl.searchParams.get('dry') === '1' }));
  } catch (error) {
    console.error('Cron lifecycle error:', error);
    return NextResponse.json({ error: 'Run failed' }, { status: 500 });
  }
}
