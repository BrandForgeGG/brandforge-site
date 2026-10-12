import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { makeDistributePlan } from '@/lib/distribute-service';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordFunnelEvent } from '@/lib/project-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// A week is one real planning call plus seven day calls, so it is limited more tightly than a single carousel.
const LIMIT = { limit: 4, windowMs: 60 * 60 * 1000 };

function clientKey(request: NextRequest, userId: string | null): string {
  if (userId) return `distribute:u:${userId}`;
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return `distribute:ip:${forwarded.split(',')[0].trim() || 'unknown'}`;
}

// POST { text?, url?, fileText?, fileName?, perDay?, startDate?, brand? } -> { plan }
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const rate = checkRateLimit(clientKey(request, user?.id ?? null), LIMIT);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'That is a lot of weeks for one hour. Try again in a little while.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await makeDistributePlan({
      text: typeof body.text === 'string' ? body.text : '',
      url: typeof body.url === 'string' ? body.url : '',
      fileText: typeof body.fileText === 'string' ? body.fileText : '',
      fileName: typeof body.fileName === 'string' ? body.fileName : '',
      perDay: Number(body.perDay) || 3,
      startDate: typeof body.startDate === 'string' ? body.startDate : '',
      brand: typeof body.brand === 'string' ? body.brand : '',
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    void recordFunnelEvent('distribute_planned', { signedIn: Boolean(user), source: 'organic', properties: { source: result.plan.source } }).catch(() => undefined);
    return NextResponse.json({ plan: result.plan });
  } catch (error) {
    console.error('Distribute plan error:', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
