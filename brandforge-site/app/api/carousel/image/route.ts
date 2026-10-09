import { NextRequest, NextResponse } from 'next/server';
import { fetchImageSafe } from '@/lib/carousel-fetch.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/carousel/image?url=: fetches a page's preview picture through our server so the browser
// can draw it onto a canvas (a picture from another site would taint it). The fetch is behind the
// same private-address and redirect rules as research, capped at 4 MB, and must really be an image.
export async function GET(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const rate = checkRateLimit(`carousel-img:${forwarded.split(',')[0].trim() || 'unknown'}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many pictures. Try again later.' }, { status: 429 });

  const url = request.nextUrl.searchParams.get('url') ?? '';
  if (!/^https?:\/\//i.test(url) || url.length > 1000) return NextResponse.json({ error: 'A picture address is needed.' }, { status: 400 });
  try {
    const { bytes, contentType } = await fetchImageSafe(url);
    return new NextResponse(Buffer.from(bytes), {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return NextResponse.json({ error: 'That picture could not be loaded.' }, { status: 422 });
  }
}
