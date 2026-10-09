import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { getCalendarPost, isAdminAccount } from '@/lib/project-db';
import { renderPost } from '@/lib/calendar-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?id=&slide=: one slide of a calendar post as a PNG, for the admin to review before approving.
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user || !(await isAdminAccount(user.id))) return new NextResponse('Not allowed', { status: 403 });
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Unknown post', { status: 400 });
  const post = await getCalendarPost(id);
  const images = post ? renderPost(post) : null;
  if (!images) return new NextResponse('No slides yet', { status: 404 });
  const slide = Math.max(0, Math.min(images.length - 1, Number(request.nextUrl.searchParams.get('slide')) || 0));
  return new NextResponse(new Uint8Array(images[slide]), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=60' } });
}
