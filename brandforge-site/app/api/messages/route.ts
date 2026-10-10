import { NextRequest, NextResponse } from 'next/server';
import {
  getMessages,
  canAccessConversation,
  getConversationOwnerSession,
  deleteGuestMessage,
  mutateOwnedMessage,
  runAsGuestSession,
  toggleMessageReaction,
} from '@/lib/project-db';
import {
  normalizeMessageEdit,
  normalizeReactionEmoji,
} from '@/lib/message-actions';
import { resolveGuestSession } from '@/lib/guest-session';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';

// Generous on purpose: reactions are rapid-fire by design. Still caps floods.
const MESSAGES_RATE_LIMIT = { limit: 200, windowMs: 60 * 60 * 1000 };

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
  }

  try {
    // Newest page first; older history loads with `before=<oldest created_at>`.
    const limitRaw = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), 1000)
      : 300;
    const before = searchParams.get('before');

    const user = await getAuthenticatedUser(request);

    if (!user) {
      // Guest transcript: the HMAC session must own the conversation, then the
      // read runs inside the guest scope (service role — RLS sees no rows).
      const guest = await resolveGuestSession(request);
      if (!guest) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      const owner = await getConversationOwnerSession(conversationId);
      if (owner !== guest.sessionId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const messages = await runAsGuestSession(guest.sessionId, () =>
        getMessages(conversationId, {
          limit,
          before: before && !Number.isNaN(Date.parse(before)) ? before : undefined,
          excludeAiDrafts: true,
        })
      );
      return NextResponse.json({
        messages,
        hasMore: messages.length >= limit,
        guest: true,
      });
    }

    // BrandForge staff read any founder's history: the team reviews a chat before entering it.
    const hasAccess = await canAccessConversation(user.id, conversationId, { allowStaff: true });
    
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const messages = await getMessages(conversationId, {
      viewerId: user.id,
      limit,
      before: before && !Number.isNaN(Date.parse(before)) ? before : undefined,
      excludeAiDrafts: true,
    });
    return NextResponse.json({
      messages,
      hasMore: messages.length >= limit,
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

async function mutationError(result: 'not_found' | 'forbidden') {
  return result === 'forbidden'
    ? NextResponse.json({ error: 'You can only change your own messages' }, { status: 403 })
    : NextResponse.json({ error: 'Message or service unavailable' }, { status: 404 });
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request);

  const body = await request.json().catch(() => ({}));
  const messageId = String(body.messageId ?? '').trim();

  // A guest can delete their own messages in the chat they started. Nothing else is open to guests here.
  if (!user) {
    const guest = await resolveGuestSession(request);
    const conversationId = String(body.conversationId ?? '').trim();
    if (!guest || String(body.action ?? '') !== 'delete' || !messageId || !conversationId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const result = await deleteGuestMessage(guest.sessionId, conversationId, messageId);
    if (result !== 'deleted') return mutationError(result);
    return NextResponse.json({ success: true });
  }

  const action = String(body.action ?? '');
  if (!messageId || !['edit', 'delete', 'react'].includes(action)) {
    return NextResponse.json({ error: 'messageId and a valid action are required' }, { status: 400 });
  }

  // Throttled after validation so malformed callers keep their 400s instead of
  // burning quota (per-instance window — see lib/rate-limit.js).
  const rate = checkRateLimit(`messages:${user.id}`, MESSAGES_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests — please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    );
  }

  if (action === 'react') {
    const conversationId = String(body.conversationId ?? '').trim();
    const emoji = normalizeReactionEmoji(body.emoji);
    if (!conversationId || !emoji) {
      return NextResponse.json({ error: 'conversationId and a valid emoji are required' }, { status: 400 });
    }
    if (!(await canAccessConversation(user.id, conversationId, { allowStaff: true }))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const result = await toggleMessageReaction(messageId, conversationId, user.id, emoji);
    if (result === 'not_found' || result === 'forbidden') return mutationError(result);
    return NextResponse.json({ success: true, action: result });
  }

  if (action === 'edit') {
    const content = normalizeMessageEdit(body.content);
    if (!content) return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    const result = await mutateOwnedMessage(messageId, user.id, 'edit', content);
    if (result === 'not_found' || result === 'forbidden') return mutationError(result);
    return NextResponse.json({ success: true });
  }

  const result = await mutateOwnedMessage(messageId, user.id, 'delete');
  if (result === 'not_found' || result === 'forbidden') return mutationError(result);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  return PATCH(request);
}
