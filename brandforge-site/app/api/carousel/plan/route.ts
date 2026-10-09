import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { makeCarouselPlan } from '@/lib/carousel-service';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordFunnelEvent } from '@/lib/project-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Free to try: anyone can plan a carousel, so the guard is per person per hour plus the same global
// daily ceiling the chat uses (inside makeCarouselPlan).
const PLAN_LIMIT = { limit: 8, windowMs: 60 * 60 * 1000 };

function clientKey(request: NextRequest, userId: string | null): string {
  if (userId) return `carousel:u:${userId}`;
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return `carousel:ip:${forwarded.split(',')[0].trim() || 'unknown'}`;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const rate = checkRateLimit(clientKey(request, user?.id ?? null), PLAN_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'That is a lot of carousels for one hour. Try again in a little while.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await makeCarouselPlan({
      mode: body.mode === 'url' || body.mode === 'file' ? body.mode : 'words',
      type: typeof body.type === 'string' ? body.type : undefined,
      topic: String(body.topic ?? ''),
      url: String(body.url ?? ''),
      text: String(body.text ?? ''),
      name: String(body.name ?? ''),
      count: Number(body.count) || 7,
      cta: String(body.cta ?? ''),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    void recordFunnelEvent('carousel_planned', { signedIn: Boolean(user), source: 'organic', properties: { source: String(body.mode ?? 'words') } }).catch(() => undefined);
    return NextResponse.json({ plan: result.plan, source: result.source });
  } catch (error) {
    console.error('Carousel plan error:', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
