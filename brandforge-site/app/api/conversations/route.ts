import { NextRequest, NextResponse } from 'next/server';
import {
  addMessage,
  createConversation,
  deleteConversationForUser,
  getUserConversationSummaries,
  isStaffAccount,
  recordFunnelEvent,
} from '@/lib/project-db';
import { getActorName, getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// One chat = one project. A conversation is created the moment the founder describes an
// idea, and the first message is persisted immediately so Recents reflects reality.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let body: { initialMessage?: string } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const initialMessage = String(body.initialMessage ?? '').trim().slice(0, 8000);

    // Read the founder's existing projects *before* creating the new one, so "returning founder"
    // is a fact rather than a guess. A staff member opening their own chat is not a returning
    // founder, so this is only counted for non-staff accounts.
    const [existing, staff] = await Promise.all([
      getUserConversationSummaries(user.id),
      isStaffAccount(user.id),
    ]);
    const isRepeatFounder = !staff && existing.length > 0;

    const conversationId = await createConversation(user.id, 'New Project');

    if (!conversationId) {
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }

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
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
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
