import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { makeBrief } from '@/lib/distribute-service';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordFunnelEvent } from '@/lib/project-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Step one of a week: read what the person gave and decide what to say. The page then asks for each day separately.
const LIMIT = { limit: 6, windowMs: 60 * 60 * 1000 };

function clientKey(request: NextRequest, userId: string | null): string {
  if (userId) return `distribute-brief:u:${userId}`;
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return `distribute-brief:ip:${forwarded.split(',')[0].trim() || 'unknown'}`;
}

// POST { text?, url?, fileText?, fileName?, perDay?, startDate?, brand? } -> { brief }
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const rate = checkRateLimit(clientKey(request, user?.id ?? null), LIMIT);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'That is a lot of weeks for one hour. Try again in a little while.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await makeBrief({
      text: typeof body.text === 'string' ? body.text : '',
      url: typeof body.url === 'string' ? body.url : '',
      fileText: typeof body.fileText === 'string' ? body.fileText : '',
      fileName: typeof body.fileName === 'string' ? body.fileName : '',
      perDay: Number(body.perDay) || 3,
      startDate: typeof body.startDate === 'string' ? body.startDate : '',
      brand: typeof body.brand === 'string' ? body.brand : '',
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    void recordFunnelEvent('distribute_planned', { signedIn: Boolean(user), source: 'organic', properties: { source: result.brief.source } }).catch(() => undefined);
    return NextResponse.json({ brief: result.brief });
  } catch (error) {
    console.error('Distribute brief error:', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
