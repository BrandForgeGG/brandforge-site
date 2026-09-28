import { NextRequest, NextResponse } from 'next/server';
import { recordFunnelEvent, isAdminAccount, getFunnelSummary } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { FUNNEL_EVENTS } from '@/lib/funnel.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST /api/funnel — the only way an event reaches the table.
//
// The browser cannot insert into funnel_events directly (no INSERT policy), so this route is the
// single write path. It accepts exactly the closed event set, sanitizes properties, and never
// returns a failure to the caller: analytics must not be able to break a page.
//
// It is deliberately unauthenticated for anonymous events (landing_viewed, signin_started,
// apply_started) — a signed-in user is only ever recorded as a boolean, never by id.
//
// Because it is unauthenticated it is also the one public write endpoint, so it carries the
// boring abuse controls: a body-size cap, a per-IP rate limit (dropped events are still ok:true —
// analytics must fail quietly), and a strict visitor-id shape so nobody can stuff PII into the
// visitor_id column. Properties are allowlisted and clipped in lib/funnel.js.

const MAX_BODY_BYTES = 8_192;
const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

// The client's visitor id is a random UUID (crypto.randomUUID) with a short v-<base36> fallback
// for browsers without it. Anything else is not a visitor id — reject rather than store.
const VISITOR_ID_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|v-[0-9a-z]{1,16}-[0-9a-z]{1,16})$/i;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: true });
  }

  if (!checkRateLimit(`funnel:${clientIp(request)}`, RATE_LIMIT).allowed) {
    return NextResponse.json({ ok: true });
  }

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

  const visitorId =
    typeof body.visitorId === 'string' && VISITOR_ID_PATTERN.test(body.visitorId)
      ? body.visitorId
      : '';

  await recordFunnelEvent(event, {
    signedIn,
    visitorId,
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