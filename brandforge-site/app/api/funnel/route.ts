import { NextRequest, NextResponse } from 'next/server';
import { recordFunnelEvent, isAdminAccount, getFunnelSummary } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { FUNNEL_EVENTS } from '@/lib/funnel.js';

export const dynamic = 'force-dynamic';

// POST /api/funnel — the only way an event reaches the table.
//
// The browser cannot insert into funnel_events directly (no INSERT policy), so this route is the
// single write path. It accepts exactly the closed event set, sanitizes properties, and never
// returns a failure to the caller: analytics must not be able to break a page.
//
// It is deliberately unauthenticated for anonymous events (landing_viewed, signin_started,
// apply_started) — a signed-in user is only ever recorded as a boolean, never by id.

export async function POST(request: NextRequest) {
  let body: { event?: unknown; visitorId?: unknown; properties?: unknown } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const event = String(body.event ?? '').trim().toLowerCase();

  if (!FUNNEL_EVENTS.includes(event)) {
    // Unknown events are ignored rather than rejected loudly: a stale client should not produce
    // console noise, and there is nothing for the caller to fix.
    return NextResponse.json({ ok: true });
  }

  // Best-effort: if the session lookup fails we still record the event as signed-out.
  let signedIn = false;
  try {
    const user = await getAuthenticatedUser(request);
    signedIn = Boolean(user);
  } catch {
    signedIn = false;
  }

  await recordFunnelEvent(event, {
    signedIn,
    visitorId: typeof body.visitorId === 'string' ? body.visitorId : '',
    properties:
      body.properties && typeof body.properties === 'object' && !Array.isArray(body.properties)
        ? (body.properties as Record<string, unknown>)
        : {},
  });

  return NextResponse.json({ ok: true });
}

// GET /api/funnel — admin-only funnel counts, with the measurement window stated explicitly so a
// reader can never mistake a partial window for a real number.
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);

  if (!user || !(await isAdminAccount(user.id))) {
    return NextResponse.json({ error: 'Admin access only' }, { status: 403 });
  }

  const summary = await getFunnelSummary();

  if (!summary) {
    return NextResponse.json(
      { error: 'Funnel unavailable. Has migration 0012_funnel_events.sql been applied?' },
      { status: 503 }
    );
  }

  return NextResponse.json({
    // The measurement window is always stated, so a partial window can never be read as a real number.
    window: summary.window,
    // Every known event is reported, including zeros, so a missing step is visible rather than absent.
    events: FUNNEL_EVENTS.map((event) => ({ event, count: summary.counts.get(event) ?? 0 })),
  });
}