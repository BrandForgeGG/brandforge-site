import { NextRequest, NextResponse } from 'next/server';
import { blueprintConfig } from '@/lib/blueprint-config';
import { createSessionToken, verifySessionToken, sessionCookieOptions } from '@/lib/blueprint-session';
import { getBlueprintSession } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

// GET /api/blueprint/return?token= — master brief 6: the return link in the
// saved-blueprint email. The token is the same HMAC the bf_bp cookie carries,
// so redeeming it reinstalls the anonymous session exactly as /start would,
// and the flow restores the saved document from it. Every path lands on
// /blueprint — an expired or forged link shows the intake screen, never an
// error page, and never leaks whether a session existed.

export async function GET(request: NextRequest) {
  const config = blueprintConfig();
  const origin = new URL(request.url).origin;
  const landing = new URL('/blueprint', origin);

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
      const response = NextResponse.redirect(landing);
      response.cookies.set(
        config.sessionCookieName,
        createSessionToken(sessionId, config.sessionSecret),
        sessionCookieOptions(config.sessionTtlDays)
      );
      return response;
    }
  }

  return NextResponse.redirect(landing);
}
