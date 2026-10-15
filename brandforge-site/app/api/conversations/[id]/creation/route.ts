import { NextRequest, NextResponse } from 'next/server';
import { canAccessConversation, getConversationLink, getConversationOwnerSession, linkConversation, markCreationMessage, postArticleMessage, postCarouselMessage, postImageMessage, postVideoMessage, pruneKeptVideos } from '@/lib/project-db';
import { isKeptPath, sanitizeArticle, sanitizeVideo } from '@/lib/video-embed.js';
import { sanitizeCarousel } from '@/lib/creation-embed';
import { sanitizeImage } from '@/lib/image-kinds.js';
import { resolveGuestSession } from '@/lib/guest-session';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };

// POST: put a finished carousel (or, with creation: 'image', a single image: ad, quote, tip, announcement or poll)
// into this chat as a message (with a date, like any other). Only the person who started the chat can do it,
// signed in or as a guest. The cover picture comes as a small JPEG data URL.
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
  if (!checkRateLimit(`creation:${actor}`, LIMIT).allowed) return NextResponse.json({ error: 'Too many creations for now. Try again later.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));

  // A video or an article: its own message in its own chat. A video file must already be in the person's kept storage.
  if (body && (body.creation === 'video' || body.creation === 'article')) {
    const fields = body.creation === 'video' ? sanitizeVideo(body) : sanitizeArticle(body);
    if (!fields) return NextResponse.json({ error: 'That could not be read. Make it again.' }, { status: 400 });
    if ('videoPath' in fields && fields.videoPath && !(user && isKeptPath(fields.videoPath, user.id))) return NextResponse.json({ error: 'Unknown video.' }, { status: 400 });
    let poster: { bytes: Buffer; contentType: 'image/jpeg' } | null = null;
    const posterMatch = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(typeof body.coverDataUrl === 'string' ? body.coverDataUrl : '');
    if (posterMatch) {
      const bytes = Buffer.from(posterMatch[1], 'base64');
      if (bytes.length > 0 && bytes.length <= 1_800_000 && bytes[0] === 0xff && bytes[1] === 0xd8) poster = { bytes, contentType: 'image/jpeg' };
    }
    const fieldsObject = fields as unknown as Record<string, unknown>;
    const posted = body.creation === 'video' ? await postVideoMessage(id, fieldsObject, poster) : await postArticleMessage(id, fieldsObject);
    if (!posted) return NextResponse.json({ error: 'Could not add it to the chat. Try again.' }, { status: 500 });
    if (user && body.creation === 'video') await pruneKeptVideos(user.id).catch(() => undefined);
    if (!(await getConversationLink(id))) {
      await linkConversation(id, { kind: 'creation', title: String(fieldsObject.title ?? '').slice(0, 120) || (body.creation === 'video' ? 'A video' : 'An article'), summary: body.creation === 'video' ? 'A video made in this chat' : 'An article written in this chat' });
    }
    return NextResponse.json({ messageId: posted });
  }

  const isImage = body && body.creation === 'image';
  const image = isImage ? sanitizeImage(body) : null;
  const carousel = isImage ? null : sanitizeCarousel(body);
  if (!image && !carousel) return NextResponse.json({ error: 'That could not be read. Make it again.' }, { status: 400 });

  let cover: { bytes: Buffer; contentType: 'image/jpeg' } | null = null;
  const dataUrl = typeof body.coverDataUrl === 'string' ? body.coverDataUrl : '';
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (match) {
    const bytes = Buffer.from(match[1], 'base64');
    if (bytes.length > 0 && bytes.length <= 1_800_000 && bytes[0] === 0xff && bytes[1] === 0xd8) cover = { bytes, contentType: 'image/jpeg' };
  }

  const messageId = image
    ? await postImageMessage(id, image as unknown as Record<string, unknown>, cover)
    : await postCarouselMessage(id, carousel as unknown as Record<string, unknown>, cover, null);
  if (!messageId) return NextResponse.json({ error: 'Could not add it to the chat. Try again.' }, { status: 500 });
  if (!(await getConversationLink(id))) {
    if (image) {
      const label = { ad: 'An ad', quote: 'A quote', tip: 'A tip', announcement: 'An announcement', question: 'A poll', cover: 'A story cover', infographic: 'An infographic', offer: 'An offer', event: 'An event', pin: 'A pin' }[image.kind];
      await linkConversation(id, { kind: 'creation', title: image.copy.headline.replace(/\*/g, ''), summary: `${label} about: ${image.topic}` });
    } else if (carousel) {
      await linkConversation(id, { kind: 'creation', title: carousel.plan.cover.headline.replace(/\*/g, ''), summary: `A carousel about: ${carousel.topic}` });
    }
  }
  return NextResponse.json({ messageId });
}

// PATCH { messageId, youtubeUrl?, shared? }: marks a creation in this chat as posted or shared, so the chat shows where
// it went (publishing never removes it). Owner only.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user || !(await canAccessConversation(user.id, id, { allowStaff: false }))) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { messageId?: unknown; youtubeUrl?: unknown; shared?: unknown };
  const messageId = typeof body.messageId === 'string' ? body.messageId : '';
  const youtubeUrl = typeof body.youtubeUrl === 'string' && /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(body.youtubeUrl) ? body.youtubeUrl.slice(0, 300) : undefined;
  if (!messageId || (!youtubeUrl && body.shared !== true)) return NextResponse.json({ error: 'Nothing to mark.' }, { status: 400 });
  const ok = await markCreationMessage(id, messageId, { ...(youtubeUrl ? { youtubeUrl } : {}), ...(body.shared === true ? { shared: true } : {}) });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Could not update it.' }, { status: 400 });
}
