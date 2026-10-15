import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { createCommunityVideoUploadUrl } from '@/lib/project-db';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST: a one-time address to upload a video being shared to the community (public once the post is made).
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in to share.' }, { status: 401 });
  if (!checkRateLimit(`community-video:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'That is a lot of sharing for one hour. Try again later.' }, { status: 429 });
  const path = `community/${user.id}/${crypto.randomUUID()}.mp4`;
  const signed = await createCommunityVideoUploadUrl(path);
  if (!signed) return NextResponse.json({ error: 'Could not prepare the upload. Try again.' }, { status: 500 });
  return NextResponse.json({ path, token: signed.token });
}
