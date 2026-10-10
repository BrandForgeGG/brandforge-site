import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { makeImageCopy } from '@/lib/image-service';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordFunnelEvent } from '@/lib/project-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Free to try, like the carousel writer: a limit per person per hour, plus the shared daily AI ceiling
// (inside makeImageCopy).
const COPY_LIMIT = { limit: 12, windowMs: 60 * 60 * 1000 };

function clientKey(request: NextRequest, userId: string | null): string {
  if (userId) return `image:u:${userId}`;
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return `image:ip:${forwarded.split(',')[0].trim() || 'unknown'}`;
}

// POST { kind, topic, button? } -> { kind, copy }
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const rate = checkRateLimit(clientKey(request, user?.id ?? null), COPY_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'That is a lot of images for one hour. Try again in a little while.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await makeImageCopy({ kind: String(body.kind ?? ''), topic: String(body.topic ?? ''), button: typeof body.button === 'string' ? body.button : undefined });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    void recordFunnelEvent('image_planned', { signedIn: Boolean(user), source: 'organic', properties: { source: result.kind } }).catch(() => undefined);
    return NextResponse.json({ kind: result.kind, copy: result.copy });
  } catch (error) {
    console.error('Image copy error:', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
