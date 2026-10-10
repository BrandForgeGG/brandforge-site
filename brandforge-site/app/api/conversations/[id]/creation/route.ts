import { NextRequest, NextResponse } from 'next/server';
import { canAccessConversation, getConversationLink, getConversationOwnerSession, linkConversation, postCarouselMessage } from '@/lib/project-db';
import { sanitizeCarousel } from '@/lib/creation-embed';
import { resolveGuestSession } from '@/lib/guest-session';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };

// POST: put a finished carousel into this chat as a message (with a date, like any other). Only the person who
// started the chat can do it, signed in or as a guest. The cover picture comes as a small JPEG data URL.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthenticatedUser(request).catch(() => null);
  let allowed = false;
  let actor = '';
  if (user) {
    allowed = await canAccessConversation(user.id, id, { allowStaff: false });
    actor = user.id;
  } else {
    const guest = await resolveGuestSession(request);
    allowed = Boolean(guest) && (await getConversationOwnerSession(id)) === guest!.sessionId;
    actor = guest?.sessionId ?? '';
  }
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  if (!checkRateLimit(`creation:${actor}`, LIMIT).allowed) return NextResponse.json({ error: 'Too many carousels for now. Try again later.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const fields = sanitizeCarousel(body);
  if (!fields) return NextResponse.json({ error: 'That carousel could not be read. Make it again.' }, { status: 400 });

  let cover: { bytes: Buffer; contentType: 'image/jpeg' } | null = null;
  const dataUrl = typeof body.coverDataUrl === 'string' ? body.coverDataUrl : '';
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (match) {
    const bytes = Buffer.from(match[1], 'base64');
    if (bytes.length > 0 && bytes.length <= 1_800_000 && bytes[0] === 0xff && bytes[1] === 0xd8) cover = { bytes, contentType: 'image/jpeg' };
  }

  const messageId = await postCarouselMessage(id, fields as unknown as Record<string, unknown>, cover, null);
  if (!messageId) return NextResponse.json({ error: 'Could not add it to the chat. Try again.' }, { status: 500 });
  if (!(await getConversationLink(id))) {
    await linkConversation(id, { kind: 'creation', title: fields.plan.cover.headline.replace(/\*/g, ''), summary: `A carousel about: ${fields.topic}` });
  }
  return NextResponse.json({ messageId });
}
