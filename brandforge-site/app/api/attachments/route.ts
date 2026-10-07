import { NextRequest, NextResponse } from 'next/server';
import { displayAttachmentName, safeDownloadName } from '@/lib/message-actions';
import { resolveGuestSession } from '@/lib/guest-session';
import { canAccessConversation, getConversationOwnerSession, downloadConversationAttachment, removeConversationAttachment, uploadConversationAttachment, addMessage } from '@/lib/project-db';
import { getActorName, getAuthenticatedUser } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';

const ATTACHMENTS_RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };

export const dynamic = 'force-dynamic';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Uploads always create `conversation-<uuid>/<userId>/<uuid>-<name>` (see
// uploadConversationAttachment). Reject anything else, including `..` segments,
// so a crafted path cannot reach outside the authorized conversation prefix.
const ATTACHMENT_PATH = /^conversation-[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9][a-z0-9._-]*$/i;
const ALLOWED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain',
  'application/json', 'application/zip', 'text/csv', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4',
]);

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  // A signed-out guest may view files of the conversation their own session owns (AI images).
  const guest = user ? null : await resolveGuestSession(request);
  if (!user && !guest) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const path = request.nextUrl.searchParams.get('path') ?? '';
  const match = path.match(/^conversation-([0-9a-f-]{36})\//i);
  const allowed =
    ATTACHMENT_PATH.test(path) &&
    Boolean(match) &&
    (user
      ? await canAccessConversation(user.id, match![1], { allowStaff: true })
      : (await getConversationOwnerSession(match![1])) === guest!.sessionId);
  if (!allowed) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }
  const data = await downloadConversationAttachment(path);
  if (!data) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  const name = displayAttachmentName(path.split('/').pop() ?? 'attachment');
  const extension = name.toLowerCase().split('.').pop();
  const contentType = extension === 'png' ? 'image/png'
    : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
    : extension === 'webp' ? 'image/webp'
    : extension === 'pdf' ? 'application/pdf'
    : extension === 'csv' ? 'text/csv'
    : extension === 'json' ? 'application/json'
    : extension === 'txt' ? 'text/plain'
    : extension === 'webm' ? 'audio/webm'
    : extension === 'ogg' ? 'audio/ogg'
    : extension === 'mp3' ? 'audio/mpeg'
    : extension === 'm4a' ? 'audio/mp4'
    : 'application/octet-stream';
  return new NextResponse(data as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${contentType.startsWith('image/') ? 'inline' : 'attachment'}; filename="${safeDownloadName(name)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const form = await request.formData();
  const conversationId = String(form.get('conversationId') ?? '').trim();
  const file = form.get('file');
  if (!conversationId || !(file instanceof File)) {
    return NextResponse.json({ error: 'conversationId and file are required' }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Files must be between 1 byte and 10 MB' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'This file type is not supported' }, { status: 400 });
  }
  if (!(await canAccessConversation(user.id, conversationId, { allowStaff: true }))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }
  // Throttled after authorization: 30 × 10 MB caps upload abuse per instance.
  const rate = checkRateLimit(`attachments:${user.id}`, ATTACHMENTS_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads — please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    );
  }
  const attachment = await uploadConversationAttachment(conversationId, user.id, file);
  if (!attachment) return NextResponse.json({ error: 'Attachment could not be stored' }, { status: 500 });
  const messageId = await addMessage({
    conversation_id: conversationId,
    sender_type: 'user',
    sender_id: user.id,
    sender_name: getActorName(user),
    content: String(form.get('caption') ?? '').trim().slice(0, 8000) || `Shared ${attachment.name}`,
    content_type: 'attachment',
    artifact_data: attachment,
  });
  if (!messageId) {
    await removeConversationAttachment(attachment.path);
    return NextResponse.json({ error: 'Attachment message could not be stored' }, { status: 500 });
  }
  return NextResponse.json({ attachment, messageId });
}

