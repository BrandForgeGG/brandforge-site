import { NextRequest, NextResponse } from 'next/server';
import {
  createGuestConversation,
  getBlueprintSession,
  getBlueprintRow,
  createSupabaseAdminClient,
} from '@/lib/project-db';
import { resolveGuestSession } from '@/lib/guest-session';
import { trackFunnelEvent } from '@/lib/funnel-server';

export const dynamic = 'force-dynamic';

// POST /api/blueprint/proposal
// Converts a blueprint into a conversation (the "convert" exit).
// Creates a guest conversation if signed out, links the blueprint row to it,
// and returns the conversation ID for redirect.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blueprintId } = body;

    if (!blueprintId || typeof blueprintId !== 'string') {
      return NextResponse.json({ error: 'blueprintId is required' }, { status: 400 });
    }

    // Resolve the guest session (bf_bp cookie) for anonymous visitors
    const guest = await resolveGuestSession(request);
    if (!guest) {
      return NextResponse.json({ error: 'Session not found' }, { status: 401 });
    }

    // Verify the session exists
    const sessionResult = await getBlueprintSession(guest.sessionId);
    if (!sessionResult.ok || !sessionResult.session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Verify the blueprint exists and belongs to this session
    const blueprintResult = await getBlueprintRow(blueprintId, guest.sessionId);
    if (!blueprintResult.ok || !blueprintResult.blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    // Create a guest conversation owned by this session
    const created = await createGuestConversation(guest.sessionId, {
      source: 'blueprint',
      initialMessage: `I'd like to discuss this blueprint: ${blueprintId}`,
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
      return NextResponse.json({ error: created.error }, { status: 500 });
    }

    // Link the blueprint to the new conversation and update status to 'proposed'
    const admin = createSupabaseAdminClient();
    if (admin) {
      const { error: linkError } = await admin
        .from('blueprints')
        .update({ conversation_id: created.conversationId, status: 'proposed', updated_at: new Date().toISOString() })
        .eq('id', blueprintId)
        .eq('session_id', guest.sessionId);
      if (linkError) {
        console.error('Failed to link blueprint to conversation:', linkError.message);
      }
    }

    // Track the conversion funnel event
    await trackFunnelEvent('blueprint_proposal_requested', {
      blueprintId,
      sessionId: guest.sessionId,
    });

    return NextResponse.json({ conversationId: created.conversationId });
  } catch (err) {
    console.error('Blueprint proposal conversion error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
