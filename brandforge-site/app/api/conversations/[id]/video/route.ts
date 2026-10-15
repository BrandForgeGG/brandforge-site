import { NextRequest, NextResponse } from 'next/server';
import { canAccessConversation, conversationHasVideo, signedVideoUrl } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { isKeptPath } from '@/lib/video-embed.js';

export const dynamic = 'force-dynamic';

// GET ?path=: a short-lived link to play or download a video made in this chat. Only people in the chat get it, and only
// for a file one of its messages uses.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = request.nextUrl.searchParams.get('path') ?? '';
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user || !isKeptPath(path)) return NextResponse.json({ error: 'Unknown video.' }, { status: 404 });
  if (!(await canAccessConversation(user.id, id, { allowStaff: true })) || !(await conversationHasVideo(id, path))) return NextResponse.json({ error: 'Unknown video.' }, { status: 404 });
  const url = await signedVideoUrl(path);
  if (!url) return NextResponse.json({ error: 'This video file is no longer kept. Open the maker to make it again.' }, { status: 410 });
  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'private, no-store' } });
}
