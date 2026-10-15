import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { createVideoUploadUrl } from '@/lib/project-db';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { keep? }: a one-time address the browser uploads a finished MP4 to, straight into private storage. Videos are too big
// to pass through the site itself (4.5 MB per request), so they never do. With keep, the file stays with its chat (the video's
// draft) instead of being removed after it is posted.
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in to post a video.' }, { status: 401 });
  if (!checkRateLimit(`video-upload:${user.id}`, { limit: 20, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'That is a lot of videos for one hour. Try again later.' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { keep?: unknown };
  const path = body.keep === true ? `${user.id}/kept/${crypto.randomUUID()}.mp4` : `${user.id}/${crypto.randomUUID()}.mp4`;
  const signed = await createVideoUploadUrl(path);
  if (!signed) return NextResponse.json({ error: 'Could not prepare the upload. Try again.' }, { status: 500 });
  return NextResponse.json({ path, token: signed.token });
}
