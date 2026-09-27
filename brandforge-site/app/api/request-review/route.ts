import { NextRequest, NextResponse } from 'next/server';
import {
  addMessage,
  canAccessConversation,
  getConversation,
  updateConversationStatus,
  recordFunnelEvent,
} from '@/lib/project-db';
import { syncDiscoveryCompleteness } from '@/lib/conversation-state';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { isDiscoveryComplete } from '@/lib/discovery';
import { notify } from '@/lib/notify';

export const dynamic = 'force-dynamic';

// "Send to BrandForge review" - the founder's explicit handoff. The transition is written
// to the database and leaves a trace inside the same conversation.
export async function POST(request: NextRequest) {
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

    const conversationId = String(body.conversationId ?? '').trim();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const hasAccess = await canAccessConversation(user.id, conversationId);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // The handoff fires once. Re-sending would stack duplicate brief cards and ping the team
    // again; past review, the next move belongs to the team (proposal) — not a second handoff.
    const conversation = await getConversation(conversationId);
    const currentStatus = String(conversation?.status ?? 'DISCOVERY');

    if (currentStatus !== 'DISCOVERY') {
      return NextResponse.json(
        {
          error:
            currentStatus === 'READY_FOR_REVIEW'
              ? 'The brief is already with the team — keep adding context here, they reply in this chat.'
              : 'This project has moved past review — keep talking in this chat and the team will pick it up.',
        },
        { status: 409 }
      );
    }

    const discovery = await syncDiscoveryCompleteness(conversationId);
    const updated = await updateConversationStatus(conversationId, 'READY_FOR_REVIEW');

    if (!updated) {
      return NextResponse.json({ error: 'Failed to request review' }, { status: 500 });
    }

    await addMessage({
      conversation_id: conversationId,
      sender_type: 'ai',
      sender_name: 'BrandForge',
      content: isDiscoveryComplete(discovery.completeness)
        ? 'Requirements sent to BrandForge. A member of the team will review them and join this conversation with a proposal.'
        : `Requirements sent to BrandForge at ${discovery.percent}% discovery. The team will review them and may ask follow-up questions in this conversation.`,
      content_type: 'system',
      artifact_data: {
        type: 'review_request',
        id: conversationId,
        percent: discovery.percent,
        complete: isDiscoveryComplete(discovery.completeness),
      },
    });

    await notify('review_requested', { percent: discovery.percent });

    await recordFunnelEvent('review_requested', {
      signedIn: true,
      properties: { percent: discovery.percent, stage: 'proposal' },
    });

    return NextResponse.json({
      success: true,
      status: 'READY_FOR_REVIEW',
      discovery,
    });
  } catch (error) {
    console.error('Request review API error:', error);
    return NextResponse.json({ error: 'Failed to request review' }, { status: 500 });
  }
}
