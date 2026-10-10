import { NextRequest, NextResponse } from 'next/server';
import { canAccessConversation, getConversationLink, getConversationOwnerSession, linkConversation } from '@/lib/project-db';
import { resolveGuestSession } from '@/lib/guest-session';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Whoever may see this chat: a signed-in participant or owner, or the guest who started it.
async function mayAccess(request: NextRequest, conversationId: string, mustOwn: boolean): Promise<boolean> {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (user) return canAccessConversation(user.id, conversationId, { allowStaff: !mustOwn });
  const guest = await resolveGuestSession(request);
  if (!guest) return false;
  return (await getConversationOwnerSession(conversationId)) === guest.sessionId;
}

// GET: what this chat is the assistant for (a listing or something made here), or null.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await mayAccess(request, id, false))) return NextResponse.json({ link: null });
  return NextResponse.json({ link: await getConversationLink(id) });
}

// POST { title, summary }: a creation made in this chat (a carousel, ...) becomes the chat's goal, if it has none yet.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await mayAccess(request, id, true))) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.replace(/[*\n]+/g, ' ').trim().slice(0, 160) : '';
  const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0, 1200) : '';
  if (title.length < 3) return NextResponse.json({ error: 'A title is needed' }, { status: 400 });
  if (await getConversationLink(id)) return NextResponse.json({ link: await getConversationLink(id), kept: true });
  await linkConversation(id, { kind: 'creation', title, summary });
  return NextResponse.json({ link: await getConversationLink(id) });
}
