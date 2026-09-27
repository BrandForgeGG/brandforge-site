import { NextRequest, NextResponse } from 'next/server';
import { addMessage } from '@/lib/project-db';
import { ensureStaffParticipant, requireStaffContext } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// Post into a founder's chat as a human operator.
export async function POST(request: NextRequest) {
  try {
    let body: { conversationId?: string; message?: string } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const context = await requireStaffContext(String(body.conversationId ?? ''), request);

    if (context instanceof NextResponse) {
      return context;
    }

    const message = String(body.message ?? '').trim().slice(0, 8000);

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const joined = await ensureStaffParticipant(context);

    if (!joined) {
      return NextResponse.json({ error: 'Could not join the conversation' }, { status: 500 });
    }

    // Sender name always comes from the caller's own verified profile — a client-supplied
    // displayName could post under any name, including the founder's (H4).
    const messageId = await addMessage({
      conversation_id: context.conversationId,
      sender_type: 'human_operator',
      sender_id: context.user.id,
      sender_name: context.displayName,
      content: message,
      content_type: 'text',
    });

    if (!messageId) {
      return NextResponse.json({ error: 'Message could not be stored' }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageId });
  } catch (error) {
    console.error('Staff post API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to post message' },
      { status: 500 }
    );
  }
}
