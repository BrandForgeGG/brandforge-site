import { NextRequest, NextResponse } from 'next/server';
import { makeCoverImage } from '@/lib/carousel-cover-image';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 40;

// POST /api/carousel/cover { scene, headline, style, variant }: one cover picture for a carousel,
// painted from what the post is about. Free to try, so it is rate limited by address. A 204 means
// "no picture right now": the maker keeps its drawn art and says nothing alarming.
export async function POST(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const rate = checkRateLimit(`carousel-cover:${forwarded.split(',')[0].trim() || 'unknown'}`, { limit: 24, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of cover art for one hour. Try again later, or pick the Drawn style.' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { scene?: unknown; headline?: unknown; style?: unknown; variant?: unknown };
  const cover = await makeCoverImage({
    scene: typeof body.scene === 'string' ? body.scene : '',
    headline: typeof body.headline === 'string' ? body.headline : '',
    style: typeof body.style === 'string' ? body.style : 'photo',
    variant: typeof body.variant === 'number' ? body.variant : 0,
  });
  if (!cover) return new NextResponse(null, { status: 204 });
  return new NextResponse(Buffer.from(cover.bytes), { headers: { 'Content-Type': cover.contentType, 'Cache-Control': 'no-store' } });
}
