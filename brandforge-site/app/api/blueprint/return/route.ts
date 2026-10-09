import { NextRequest, NextResponse } from 'next/server';
import { blueprintConfig } from '@/lib/blueprint-config';
import { createSessionToken, verifySessionToken, sessionCookieOptions } from '@/lib/blueprint-session';
import { recordFunnelEvent, getBlueprintSession, getConversationOwnerSession, getCurrentBlueprintForSession } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

// GET /api/blueprint/return?token= — master brief 6: the return link in the
// saved-blueprint email. The token is the same HMAC the bf_bp cookie carries,
// so redeeming it reinstalls the anonymous session exactly as /start would.
// Landing (redesign slice B): a blueprint that lives in a conversation opens
// that conversation; anything else opens the chat shell's blueprint panel —
// an expired or forged link shows the intake screen, never an error page, and
// never leaks whether a session existed.

export async function GET(request: NextRequest) {
  const config = blueprintConfig();
  const origin = new URL(request.url).origin;
  const intake = new URL('/chat?blueprint=1', origin);

  if (!config.enabled) {
    return NextResponse.redirect(new URL('/', origin));
  }
  if (!config.sessionSecret) {
    return NextResponse.json({ error: 'Blueprint session secret not configured.' }, { status: 503 });
  }

  const token = new URL(request.url).searchParams.get('token');
  const sessionId = verifySessionToken(token, config.sessionSecret);
  if (sessionId) {
    const session = await getBlueprintSession(sessionId);
    if (session.ok && session.session) {
      let landing = intake;
      // A chat bot hands people back to the exact chat they were in, only if their session owns it.
      const wanted = new URL(request.url).searchParams.get('conversationId');
      if (wanted && (await getConversationOwnerSession(wanted)) === sessionId) {
        // Counts people who moved from a chat app to the web, by app (telegram | discord).
        const via = new URL(request.url).searchParams.get('via');
        await recordFunnelEvent('bot_continue_clicked', { source: 'organic', properties: { source: via === 'discord' ? 'discord' : 'telegram' } }).catch(() => undefined);
        const opened = NextResponse.redirect(new URL(`/chat?conversationId=${encodeURIComponent(wanted)}`, origin));
        opened.cookies.set(config.sessionCookieName, createSessionToken(sessionId, config.sessionSecret), sessionCookieOptions(config.sessionTtlDays));
        return opened;
      }
      const current = await getCurrentBlueprintForSession(sessionId);
      const conversationId =
        current.ok && current.blueprint?.conversation_id ? current.blueprint.conversation_id : null;
      if (conversationId) {
        landing = new URL(`/chat?conversationId=${encodeURIComponent(conversationId)}`, origin);
      }
      const response = NextResponse.redirect(landing);
      response.cookies.set(
        config.sessionCookieName,
        createSessionToken(sessionId, config.sessionSecret),
        sessionCookieOptions(config.sessionTtlDays)
      );
      return response;
    }
  }

  return NextResponse.redirect(intake);
}
