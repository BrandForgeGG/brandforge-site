import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { listCarouselChannels, recordFunnelEvent } from '@/lib/project-db';
import { publishToChannel } from '@/lib/carousel-channels';
import { sniff } from '@/lib/carousel-fetch.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_FILE = 4 * 1024 * 1024;

// POST (multipart): caption, channelIds (a JSON array) and slide0..slide9 (PNG files). The slides are
// drawn in the person's own browser, so their own pictures and logo are in them; this route only checks
// the files really are images, then sends them to channels the person has linked.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Sign in to post.' }, { status: 401 });
    const rate = checkRateLimit(`carousel-publish:${user.id}`, { limit: 20, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of posts for one hour. Try again later.' }, { status: 429 });

    const form = await request.formData();
    const caption = String(form.get('caption') ?? '').slice(0, 3000);
    let ids: string[] = [];
    try {
      ids = (JSON.parse(String(form.get('channelIds') ?? '[]')) as unknown[]).map(String).slice(0, 10);
    } catch {
      ids = [];
    }
    const images: Buffer[] = [];
    for (let i = 0; i < 10; i++) {
      const file = form.get(`slide${i}`);
      if (!(file instanceof File)) continue;
      if (file.size > MAX_FILE) return NextResponse.json({ error: `Slide ${i + 1} is too large.` }, { status: 413 });
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!sniff(bytes)) return NextResponse.json({ error: `Slide ${i + 1} is not a picture.` }, { status: 400 });
      images.push(bytes);
    }
    if (images.length === 0) return NextResponse.json({ error: 'There are no slides to post.' }, { status: 400 });

    const mine = await listCarouselChannels(user.id);
    const chosen = mine.filter((c) => ids.includes(c.id));
    if (chosen.length === 0) return NextResponse.json({ error: 'Pick a channel to post to.' }, { status: 400 });

    const results: Record<string, { ok: boolean; note?: string }> = {};
    for (const channel of chosen) results[channel.id] = await publishToChannel(channel, images, caption);
    void recordFunnelEvent('carousel_published', { signedIn: true, source: 'organic', properties: { status: Object.values(results).every((r) => r.ok) ? 'ok' : 'partial' } }).catch(() => undefined);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Carousel publish error:', error);
    return NextResponse.json({ error: 'Could not post. Try again.' }, { status: 500 });
  }
}
