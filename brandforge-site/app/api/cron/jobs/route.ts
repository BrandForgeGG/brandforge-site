import { NextRequest, NextResponse } from 'next/server';
import { runDueJobs } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
    }
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runDueJobs();
    if (!result.ran) {
      return NextResponse.json({ ran: false, reason: result.reason ?? null }, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Cron jobs error:', error);
    return NextResponse.json({ error: 'Cron run failed' }, { status: 500 });
  }
}
