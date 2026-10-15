import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { listCreationChats } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

// GET: the signed-in person's creations. Each creation is a chat (its draft and its history); this lists them with what
// the newest version looks like and where it went (YouTube, the community).
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ creations: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  const creations = await listCreationChats(user.id);
  return NextResponse.json({ creations }, { headers: { 'Cache-Control': 'private, no-store' } });
}
