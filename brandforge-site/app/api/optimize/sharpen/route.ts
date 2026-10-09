import { NextRequest, NextResponse } from 'next/server';
import { KINDS, sharpen, type SharpenKind } from '@/lib/optimize-sharpen';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { kind, text }: three sharper versions of the person's own copy. Free to try, so it is rate limited
// by address.
export async function POST(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const rate = checkRateLimit(`optimize-sharpen:${forwarded.split(',')[0].trim() || 'unknown'}`, { limit: 12, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of edits for one hour. Try again later, or sign in.' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; text?: unknown };
  const kind = typeof body.kind === 'string' && Object.prototype.hasOwnProperty.call(KINDS, body.kind) ? (body.kind as SharpenKind) : 'hook';
  const result = await sharpen(kind, String(body.text ?? ''));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.result);
}
