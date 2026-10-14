import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { cancelScheduledPost, createScheduledPost, listCarouselChannels, listScheduledPosts, recordFunnelEvent, removeScheduledImages, uploadScheduledImage } from '@/lib/project-db';
import { sniff } from '@/lib/carousel-fetch.js';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';
import { MAX_SLIDES, validateSchedule } from '@/lib/schedule.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_FILE = 2 * 1024 * 1024;

async function requireUser(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return { error: NextResponse.json({ error: 'Sign in to schedule posts.' }, { status: 401 }) } as const;
  return { user } as const;
}

// GET: your scheduled posts from three days ago on, with what happened to each.
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;
  const { ready, rows } = await listScheduledPosts(auth.user.id);
  return NextResponse.json({
    ready,
    posts: rows.map((row) => ({ id: row.id, label: row.label, runAt: row.run_at, status: row.status, channelIds: row.channel_ids, results: row.results })),
  });
}

// POST (multipart): caption, runAt (ISO), channelIds (a JSON array), label, slide0..slide9 (PNG files drawn in the browser).
// The pictures are kept until the post goes out, then deleted.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ('error' in auth) return auth.error;
    const rate = checkRateLimit(`schedule:${auth.user.id}`, { limit: 120, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of posts for one hour. Try again later.' }, { status: 429 });

    const form = await request.formData();
    const caption = String(form.get('caption') ?? '').slice(0, 3000);
    const label = String(form.get('label') ?? '').slice(0, 120);
    let channelIds: string[] = [];
    try {
      channelIds = (JSON.parse(String(form.get('channelIds') ?? '[]')) as unknown[]).map(String).slice(0, 10);
    } catch {
      channelIds = [];
    }
    const files: File[] = [];
    for (let i = 0; i < MAX_SLIDES; i++) {
      const file = form.get(`slide${i}`);
      if (file instanceof File) files.push(file);
    }
    const checked = validateSchedule({ runAt: String(form.get('runAt') ?? ''), channelIds, caption, slideCount: files.length });
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const screened = screenText(caption);
    if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });

    const mine = await listCarouselChannels(auth.user.id);
    const chosen = mine.filter((c) => channelIds.includes(c.id)).map((c) => c.id);
    if (chosen.length === 0) return NextResponse.json({ error: 'Pick a channel you have linked.' }, { status: 400 });

    const id = crypto.randomUUID();
    const paths: string[] = [];
    for (const [i, file] of files.entries()) {
      if (file.size > MAX_FILE) {
        await removeScheduledImages(paths);
        return NextResponse.json({ error: `Picture ${i + 1} is too large.` }, { status: 413 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const type = sniff(bytes);
      if (type !== 'image/png' && type !== 'image/jpeg') {
        await removeScheduledImages(paths);
        return NextResponse.json({ error: `Picture ${i + 1} is not an image.` }, { status: 400 });
      }
      const path = `scheduled/${auth.user.id}/${id}/slide-${i + 1}.${type === 'image/jpeg' ? 'jpg' : 'png'}`;
      if (!(await uploadScheduledImage(path, bytes, type))) {
        await removeScheduledImages(paths);
        return NextResponse.json({ error: 'Could not store the pictures. Try again.' }, { status: 500 });
      }
      paths.push(path);
    }

    const saved = await createScheduledPost(auth.user.id, { id, channelIds: chosen, caption, imagePaths: paths, label, runAt: checked.runAt });
    if (!saved.ok) {
      await removeScheduledImages(paths);
      if (saved.reason === 'not_ready') return NextResponse.json({ error: 'Scheduling is being switched on. Try again in a few minutes.', notReady: true }, { status: 503 });
      return NextResponse.json({ error: 'Could not schedule that. Try again.' }, { status: 500 });
    }
    void recordFunnelEvent('carousel_published', { signedIn: true, source: 'organic', properties: { status: 'scheduled' } }).catch(() => undefined);
    return NextResponse.json({ id, runAt: checked.runAt });
  } catch (error) {
    console.error('Schedule error:', error);
    return NextResponse.json({ error: 'Could not schedule that. Try again.' }, { status: 500 });
  }
}

// DELETE ?id=: cancel one scheduled post of yours (only while it is still waiting).
export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Unknown post.' }, { status: 400 });
  const paths = await cancelScheduledPost(auth.user.id, id);
  if (!paths) return NextResponse.json({ error: 'That post is already on its way or gone.' }, { status: 409 });
  await removeScheduledImages(paths);
  return NextResponse.json({ success: true });
}
