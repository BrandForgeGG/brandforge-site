import { NextRequest, NextResponse } from 'next/server';
import { blueprintConfig } from '@/lib/blueprint-config';
import { verifySessionToken } from '@/lib/blueprint-session';
import { getBlueprintSession, getCurrentBlueprintForSession } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

// GET /api/blueprint/current — master brief 6: the restore half of the
// return link. Reads the newest blueprint this session produced (read-only,
// no quota, no LLM) so a saved document reopens as a result instead of an
// empty intake. 404 is the quiet "nothing to restore" answer: fresh visitors
// hit it on every load and the flow simply stays at intake.

function dbError(error: string): NextResponse {
  if (error === 'pending_migration') {
    return NextResponse.json(
      { error: 'Blueprint storage is not set up yet. Has migration 0022 been applied?' },
      { status: 503 }
    );
  }
  if (error === 'not_configured') {
    return NextResponse.json({ error: 'Blueprint storage is not configured.' }, { status: 503 });
  }
  return NextResponse.json({ error: 'Blueprint storage failed.' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const config = blueprintConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: 'No blueprint.' }, { status: 404 });
  }
  if (!config.sessionSecret) {
    return NextResponse.json({ error: 'Blueprint session secret not configured.' }, { status: 503 });
  }

  const cookie = request.cookies.get(config.sessionCookieName)?.value ?? null;
  const sessionId = verifySessionToken(cookie, config.sessionSecret);
  if (!sessionId) {
    return NextResponse.json({ error: 'No blueprint.' }, { status: 404 });
  }

  const sessionResult = await getBlueprintSession(sessionId);
  if (!sessionResult.ok) return dbError(sessionResult.error);
  if (!sessionResult.session) {
    return NextResponse.json({ error: 'No blueprint.' }, { status: 404 });
  }

  const current = await getCurrentBlueprintForSession(sessionId);
  if (!current.ok) return dbError(current.error);
  const row = current.blueprint;
  // 'draft' rows hold the seed placeholder, never a synthesized document —
  // restoring one would show a fake blueprint, so there is nothing to return.
  if (!row || row.status === 'draft') {
    return NextResponse.json({ error: 'No blueprint.' }, { status: 404 });
  }

  return NextResponse.json({
    blueprintId: row.id,
    version: row.version,
    status: row.status,
    lane: row.lane,
    confidence: row.confidence,
    document: row.document,
    hasEmail: Boolean(row.email),
    // Redesign slice B: a blueprint that already lives in a conversation is
    // restored by opening that conversation (the card renders from its embed
    // message) instead of the inline result screen.
    conversationId: row.conversation_id ?? null,
  });
}
