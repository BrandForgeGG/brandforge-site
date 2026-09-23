import { NextRequest, NextResponse } from 'next/server';
import { addMessage, canAccessConversation, updateConversationStatus } from '@/lib/project-db';
import { syncDiscoveryCompleteness } from '@/lib/conversation-state';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { isDiscoveryComplete } from '@/lib/discovery';

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
