import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { downloadVideo, listCarouselChannels, recordPublishedPosts, removeVideo } from '@/lib/project-db';
import { uploadToYouTube } from '@/lib/youtube';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { path, channelIds, title, description, publishAt?, vertical, seconds }: sends a video the browser already uploaded
// to the person's own storage folder to the YouTube channels they chose, then deletes the file. With publishAt, YouTube
// publishes it at that time by itself.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Sign in to post a video.' }, { status: 401 });
    if (!checkRateLimit(`video-publish:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'That is a lot of videos for one hour. Try again later.' }, { status: 429 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const path = String(body.path ?? '');
    // Only a file in this person's own folder, named the way the upload address names it.
    if (!new RegExp(`^${user.id}/[0-9a-f-]{36}\\.mp4$`).test(path)) return NextResponse.json({ error: 'Unknown video.' }, { status: 400 });
    const title = String(body.title ?? '').slice(0, 100);
    const description = String(body.description ?? '').slice(0, 4900);
    const screened = screenText(`${title}\n${description}`);
    if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });
    const ids = (Array.isArray(body.channelIds) ? body.channelIds : []).map(String).slice(0, 5);
    const chosen = (await listCarouselChannels(user.id)).filter((channel) => channel.kind === 'youtube' && ids.includes(channel.id));
    if (chosen.length === 0) return NextResponse.json({ error: 'Pick a YouTube channel you have linked.' }, { status: 400 });

    const bytes = await downloadVideo(path);
    if (!bytes) return NextResponse.json({ error: 'The video upload did not arrive. Try again.' }, { status: 400 });
    const publishAt = typeof body.publishAt === 'string' && !Number.isNaN(Date.parse(body.publishAt)) ? body.publishAt : null;
    const results: Record<string, { ok: boolean; note?: string; url?: string }> = {};
    for (const channel of chosen) results[channel.id] = await uploadToYouTube(channel, { bytes, title, description, publishAt, vertical: Boolean(body.vertical), seconds: Number(body.seconds) || 0 });
    await removeVideo(path);
    await recordPublishedPosts(user.id, chosen.filter((channel) => results[channel.id]?.ok && results[channel.id]?.url).map((channel) => ({ network: 'youtube', url: results[channel.id].url as string, caption: title }))).catch(() => undefined);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Video publish error:', error);
    return NextResponse.json({ error: 'Could not post the video. Try again.' }, { status: 500 });
  }
}
