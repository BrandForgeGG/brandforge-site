import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { createCommunityPost, getAvatarUrls, getProfileDisplayNames, isAdminAccount, listCommunityPosts, removeCommunityPost, removeScheduledImages, uploadCommunityImage, type CommunityKind } from '@/lib/project-db';
import { sniff } from '@/lib/carousel-fetch.js';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_FILE = 2 * 1024 * 1024;
const MAX_IMAGES = 10;
const isKind = (value: unknown): value is CommunityKind => value === 'create' || value === 'distribute';

// GET ?kind=create|distribute[&before=ISO]: what people shared, newest first, with the name and picture they go by.
// Public: these were shared on purpose, to be seen.
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get('kind');
  if (!isKind(kind)) return NextResponse.json({ error: 'Unknown feed.' }, { status: 400 });
  const before = request.nextUrl.searchParams.get('before') ?? undefined;
  const rows = await listCommunityPosts(kind, 24, before && !Number.isNaN(Date.parse(before)) ? before : undefined);
  const ids = rows.map((row) => row.user_id);
  const [names, avatars, viewer] = await Promise.all([getProfileDisplayNames(ids), getAvatarUrls(ids), getAuthenticatedUser(request).catch(() => null)]);
  const admin = viewer ? await isAdminAccount(viewer.id).catch(() => false) : false;
  return NextResponse.json(
    {
      posts: rows.map((row) => ({
        id: row.id,
        format: row.format,
        title: row.title,
        caption: row.caption,
        images: row.image_urls,
        createdAt: row.created_at,
        ownerName: names.get(row.user_id) ?? 'A member',
        ownerAvatar: avatars.get(row.user_id) ?? null,
        canRemove: Boolean(viewer && (viewer.id === row.user_id || admin)),
      })),
    },
    { headers: { 'Cache-Control': viewer ? 'private, no-store' : 'public, s-maxage=30, stale-while-revalidate=120' } },
  );
}

// POST (multipart, signed in): kind, format, title, caption, image0..image9 (PNG, drawn in the browser). Shares one creation
// with everyone. The words are checked against the content policy; the files must really be pictures.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Sign in to share.' }, { status: 401 });
    const rate = checkRateLimit(`community:${user.id}`, { limit: 20, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of sharing for one hour. Try again later.' }, { status: 429 });

    const form = await request.formData();
    const kind = form.get('kind');
    if (!isKind(kind)) return NextResponse.json({ error: 'Unknown feed.' }, { status: 400 });
    const format = String(form.get('format') ?? '').replace(/[^a-z-]/gi, '').slice(0, 30);
    const title = String(form.get('title') ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const caption = String(form.get('caption') ?? '').trim().slice(0, 2200);
    const screened = screenText(`${title}\n${caption}`);
    if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });

    const files: File[] = [];
    for (let i = 0; i < MAX_IMAGES; i++) {
      const file = form.get(`image${i}`);
      if (file instanceof File) files.push(file);
    }
    if (files.length === 0) return NextResponse.json({ error: 'There is no picture to share.' }, { status: 400 });

    const id = crypto.randomUUID();
    const paths: string[] = [];
    const urls: string[] = [];
    for (const [i, file] of files.entries()) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const type = sniff(bytes);
      if (file.size > MAX_FILE || (type !== 'image/png' && type !== 'image/jpeg')) {
        await removeScheduledImages(paths);
        return NextResponse.json({ error: `Picture ${i + 1} is not a picture under 2 MB.` }, { status: 400 });
      }
      const path = `community/${user.id}/${id}/${i + 1}.${type === 'image/jpeg' ? 'jpg' : 'png'}`;
      const url = await uploadCommunityImage(path, bytes, type);
      if (!url) {
        await removeScheduledImages(paths);
        return NextResponse.json({ error: 'Could not store the pictures. Try again.' }, { status: 500 });
      }
      paths.push(path);
      urls.push(url);
    }
    if (!(await createCommunityPost(user.id, { id, kind, format, title, caption, imageUrls: urls, imagePaths: paths }))) {
      await removeScheduledImages(paths);
      return NextResponse.json({ error: 'Could not share that. Try again.' }, { status: 500 });
    }
    return NextResponse.json({ id });
  } catch (error) {
    console.error('Community share error:', error);
    return NextResponse.json({ error: 'Could not share that. Try again.' }, { status: 500 });
  }
}

// DELETE ?id=: the owner removes their post (pictures deleted too); an admin hides anyone's.
export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Unknown post.' }, { status: 400 });
  const paths = await removeCommunityPost(user.id, id, await isAdminAccount(user.id).catch(() => false));
  if (!paths) return NextResponse.json({ error: 'You cannot remove that post.' }, { status: 403 });
  await removeScheduledImages(paths);
  return NextResponse.json({ success: true });
}
