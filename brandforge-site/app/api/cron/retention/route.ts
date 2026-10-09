import { NextRequest, NextResponse } from 'next/server';
import { purgeStaleGuestData } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

const GUEST_CHAT_DAYS = Math.max(30, Number(process.env.GUEST_CHAT_RETENTION_DAYS) || 90);

// Daily: removes guest chats (and their files) that nobody signed in to keep and that have been
// quiet for GUEST_CHAT_RETENTION_DAYS (default 90, never under 30). Matches the Privacy Policy.
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
    if ((request.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const result = await purgeStaleGuestData(GUEST_CHAT_DAYS);
    return NextResponse.json({ days: GUEST_CHAT_DAYS, ...result });
  } catch (error) {
    console.error('Cron retention error:', error);
    return NextResponse.json({ error: 'Cron run failed' }, { status: 500 });
  }
}
