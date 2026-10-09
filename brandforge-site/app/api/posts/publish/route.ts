import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { listCarouselChannels, recordFunnelEvent } from '@/lib/project-db';
import { publishPostToChannel } from '@/lib/post-publish';
import { normalizePost } from '@/lib/post-types.js';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { post, channelIds }: sends an update, poll, quiz or thread to channels the person linked. The post
// is checked again here (limits, content policy); channels must be the caller's own.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Sign in to post.' }, { status: 401 });
    const rate = checkRateLimit(`post-publish:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of posts for one hour. Try again later.' }, { status: 429 });

    const body = (await request.json().catch(() => ({}))) as { post?: unknown; channelIds?: unknown };
    const checked = normalizePost(body.post);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const post = checked.post;
    const screened = screenText(JSON.stringify(post));
    if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });

    const ids = (Array.isArray(body.channelIds) ? body.channelIds : []).map(String).slice(0, 10);
    const mine = await listCarouselChannels(user.id);
    const chosen = mine.filter((c) => ids.includes(c.id));
    if (chosen.length === 0) return NextResponse.json({ error: 'Pick a channel to post to.' }, { status: 400 });

    const results: Record<string, { ok: boolean; note?: string }> = {};
    for (const channel of chosen) results[channel.id] = await publishPostToChannel(channel, post);
    void recordFunnelEvent('carousel_published', { signedIn: true, source: 'organic', properties: { status: Object.values(results).every((r) => r.ok) ? 'ok' : 'partial', source: post.type } }).catch(() => undefined);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Post publish error:', error);
    return NextResponse.json({ error: 'Could not post. Try again.' }, { status: 500 });
  }
}
