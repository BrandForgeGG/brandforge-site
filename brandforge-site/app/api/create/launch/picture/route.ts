import { NextRequest, NextResponse } from 'next/server';
import { checkPicture, fetchImage, screenshotSources } from '@/lib/launch-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET ?kind=img|shot&u=<address>&s=<signature> -> the picture. Only addresses the launch route signed are served (a site's
// own pictures, or a screenshot of the site), so the canvas in the browser can use them and the route is not an open proxy.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const url = params.get('u') ?? '';
  if (!url || !checkPicture(url, params.get('s') ?? '')) return NextResponse.json({ error: 'Unknown picture.' }, { status: 404 });
  const sources = params.get('kind') === 'shot' ? screenshotSources(url) : [url];
  for (const source of sources) {
    try {
      const { bytes, type } = await fetchImage(source, params.get('kind') === 'shot' ? 25000 : 12000);
      // A screenshot service answers with a tiny placeholder while it works; that is not the page.
      if (params.get('kind') === 'shot' && bytes.byteLength < 12_000) continue;
      return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' } });
    } catch (cause) {
      console.warn('[launch] picture failed:', cause instanceof Error ? cause.message : cause);
    }
  }
  return NextResponse.json({ error: 'That picture could not be loaded.' }, { status: 502 });
}
