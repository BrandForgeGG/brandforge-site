import { NextRequest, NextResponse } from 'next/server';
import { runDueMarketingPosts } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

// Vercel cron entry point for the marketing queue: the same publisher as the
// admin button, guarded by CRON_SECRET (Vercel calls cron paths with
// `Authorization: Bearer $CRON_SECRET`). Missing secret = refuse to run — this
// endpoint is never open, even with the URL known.
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

    const result = await runDueMarketingPosts();
    if (!result.ran) {
      return NextResponse.json({ ran: false, reason: result.reason ?? null }, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Cron marketing error:', error);
    return NextResponse.json({ error: 'Cron run failed' }, { status: 500 });
  }
}
