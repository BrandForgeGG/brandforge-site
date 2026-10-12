import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runDueScheduledPosts } from '@/lib/schedule-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Two ways in. Vercel's own daily cron sends CRON_SECRET. The every-few-minutes trigger (a Supabase pg_cron job) sends a token
// derived from the service key, so it needs no extra secret to be stored anywhere: sha256("publish-cron:" + key).
export function runnerToken(serviceKey: string): string {
  return createHash('sha256').update(`publish-cron:${serviceKey}`).digest('hex');
}

export async function GET(request: NextRequest) {
  try {
    const auth = request.headers.get('authorization') ?? '';
    const cronSecret = process.env.CRON_SECRET;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const ok = (cronSecret && same(auth, `Bearer ${cronSecret}`)) || (serviceKey && same(auth, `Bearer ${runnerToken(serviceKey)}`));
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(await runDueScheduledPosts());
  } catch (error) {
    console.error('Cron publish error:', error);
    return NextResponse.json({ error: 'Run failed' }, { status: 500 });
  }
}
