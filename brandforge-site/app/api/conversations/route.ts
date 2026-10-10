import { after, NextRequest, NextResponse } from 'next/server';
import { sendFirstTimeEmail } from '@/lib/first-time-email';
import {
  addMessage,
  createConversation,
  createGuestConversation,
  deleteConversationForUser,
  getSessionConversationSummaries,
  getUserConversationSummaries,
  isStaffAccount,
  recordFunnelEvent,
} from '@/lib/project-db';
import { attachGuestCookies, ensureGuestSession, resolveGuestSession } from '@/lib/guest-session';
import { getActorName, getAuthenticatedUser } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getRetainer } from '@/lib/plans.js';
import { postOpsEvent } from '@/lib/ops-events';

const CONVERSATION_CREATE_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };
const CONVERSATION_DELETE_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

export const dynamic = 'force-dynamic';

// One chat = one project. A conversation is created the moment the founder describes an
// idea, and the first message is persisted immediately so Recents reflects reality.
export async function POST(request: NextRequest) {
  try {
    let body: { initialMessage?: string; source?: string; guest?: unknown; plan?: unknown } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const user = await getAuthenticatedUser(request);

    // Guest creation is explicitly opt-in (`guest: true`) so the default
    // contract for anonymous POSTs stays 401 — probes and integrations that
    // omit the flag keep failing closed, while the hero asks for it by name.
    if (!user && body.guest !== true) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const initialMessage = String(body.initialMessage ?? '').trim().slice(0, 8000);
    // A monthly plan asked for on the pricing page: the team is told the moment the chat exists.
    const asked = typeof body.plan === 'string' ? getRetainer(body.plan) : null;
    // Traffic classification: probes and e2e runs self-declare `source: 'test'` so
    // revenue metrics stay clean. Anything else reads as organic; claiming 'test'
    // only excludes the caller from aggregates, so there is nothing to gain by lying.

    // ---- Guest path: anonymous bf_bp session owns the conversation (0023). ----
    if (!user) {
      const ensured = await ensureGuestSession(request);
      if (!ensured.ok) {
        const headers = ensured.retryAfterSeconds
          ? { 'Retry-After': String(ensured.retryAfterSeconds) }
          : undefined;
        return NextResponse.json({ error: ensured.error }, { status: ensured.status, headers });
      }

      const createRate = checkRateLimit(
        `conversations-create:guest:${ensured.sessionId}`,
        CONVERSATION_CREATE_RATE_LIMIT
      );
      if (!createRate.allowed) {
        return NextResponse.json(
          { error: 'Too many new chats — please try again later.' },
          { status: 429, headers: { 'Retry-After': String(createRate.retryAfterSeconds) } }
        );
      }

      const created = await createGuestConversation(ensured.sessionId, {
        source: typeof body.source === 'string' ? body.source : undefined,
        initialMessage,
      });
      if (!created.ok) {
        if (created.error === 'pending_migration') {
          return NextResponse.json(
            { error: 'Guest chat storage is not set up yet. Has migration 0023 been applied?' },
            { status: 503 }
          );
        }
        if (created.error === 'not_configured') {
          return NextResponse.json({ error: 'Guest chat storage is not configured.' }, { status: 503 });
        }
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
      }

      if (created.messageId) {
        // Server-side, same as the signed-in path: the funnel counts real stored
        // first messages, never the client's claim, and only the length context travels.
        await recordFunnelEvent('project_described', {
          signedIn: false,
          properties: { source: 'first_message', percent: 0 },
        });
      }

      if (asked && created.conversationId) {
        await recordFunnelEvent('plan_requested', { signedIn: false, properties: { source: asked.id } });
        after(() => postOpsEvent('plan_requested', { title: `${asked.name} ${asked.price}${asked.cadence}`, conversationId: created.conversationId }));
      }

      const response = NextResponse.json({
        conversationId: created.conversationId,
        messageId: created.messageId,
        hasInitialMessage: Boolean(created.messageId),
        guest: true,
      });
      attachGuestCookies(response, ensured.sessionId);
      return response;
    }

    // ---- Signed-in path (unchanged). ----

    // Throttled after authentication so signed-out callers keep their 401
    // instead of burning quota (per-instance window — see lib/rate-limit.js).
    const createRate = checkRateLimit(`conversations-create:${user.id}`, CONVERSATION_CREATE_RATE_LIMIT);
    if (!createRate.allowed) {
      return NextResponse.json(
        { error: 'Too many new chats — please try again later.' },
        { status: 429, headers: { 'Retry-After': String(createRate.retryAfterSeconds) } }
      );
    }

    // Read the founder's existing projects *before* creating the new one, so "returning founder"
    // is a fact rather than a guess. A staff member opening their own chat is not a returning
    // founder, so this is only counted for non-staff accounts.
    const [existing, staff] = await Promise.all([
      getUserConversationSummaries(user.id),
      isStaffAccount(user.id),
    ]);
    const isRepeatFounder = !staff && existing.length > 0;

    const conversationId = await createConversation(user.id, 'New Project', body.source);

    if (!conversationId) {
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }

    if (!staff) after(() => sendFirstTimeEmail(user.id, user.email, 'first_chat'));

    let messageId: string | null = null;

    if (initialMessage) {
      messageId = await addMessage({
        conversation_id: conversationId,
        sender_type: 'user',
        sender_id: user.id,
        sender_name: getActorName(user),
        content: initialMessage,
        content_type: 'text',
      });

      if (!messageId) {
        return NextResponse.json(
          { error: 'The conversation was created but the first message could not be stored' },
          { status: 500 }
        );
      }

      // The first message is the moment a founder actually described a project. Recorded server-side
      // because the client cannot be trusted to report it, and only the length is kept — never the text.
      await recordFunnelEvent('project_described', {
        signedIn: true,
        properties: { source: 'first_message', percent: 0 },
      });

      // A second project from the same founder is the strongest retention signal we have. Counted
      // only alongside a real first message, so an abandoned empty chat is not a repeat project.
      if (isRepeatFounder) {
        await recordFunnelEvent('repeat_project_started', { signedIn: true });
      }
    }

    if (asked) {
      await recordFunnelEvent('plan_requested', { signedIn: true, properties: { source: asked.id } });
      after(() => postOpsEvent('plan_requested', { title: `${asked.name} ${asked.price}${asked.cadence}`, conversationId }));
    }

    return NextResponse.json({
      conversationId,
      messageId,
      hasInitialMessage: Boolean(messageId),
    });
  } catch (error) {
    console.error('Create conversation API error:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}

// Recents must show real persisted conversations only: a chat with zero messages has not
// become a project yet, so it is never listed.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      const guest = await resolveGuestSession(request);
      if (!guest) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      const conversations = await getSessionConversationSummaries(guest.sessionId);
      return NextResponse.json({ conversations, guest: true });
    }

    const conversations = await getUserConversationSummaries(user.id);

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('List conversations API error:', error);
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
  }
}

// Owners can delete a conversation - and with it the project state that hangs off it (requirements,
// proposal, milestones, agreement, payments, tasks, messages). Ownership is verified with the
// caller's own session; the delete itself uses the service role, because the child tables carry no
// DELETE policy for the founder.
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let body: { conversationId?: string } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const conversationId = String(
      body.conversationId ?? request.nextUrl.searchParams.get('conversationId') ?? ''
    ).trim();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const deleteRate = checkRateLimit(`conversations-delete:${user.id}`, CONVERSATION_DELETE_RATE_LIMIT);
    if (!deleteRate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests — please try again later.' },
        { status: 429, headers: { 'Retry-After': String(deleteRate.retryAfterSeconds) } }
      );
    }

    const outcome = await deleteConversationForUser(user.id, conversationId);

    if (outcome === 'deleted') {
      return NextResponse.json({ deleted: true, conversationId });
    }

    const status =
      outcome === 'not_found'
        ? 404
        : outcome === 'forbidden'
          ? 403
          : outcome === 'not_configured'
            ? 503
            : 500;

    const message =
      outcome === 'not_found'
        ? 'Conversation not found.'
        : outcome === 'forbidden'
          ? 'Only the owner of a conversation can delete it.'
          : outcome === 'not_configured'
            ? 'Deleting conversations needs the server-only Supabase service role key (SUPABASE_SERVICE_ROLE_KEY).'
            : 'The conversation could not be deleted.';

    return NextResponse.json({ error: message, outcome }, { status });
  } catch (error) {
    console.error('Delete conversation API error:', error);
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
}
