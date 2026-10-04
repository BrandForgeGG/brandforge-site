import { NextRequest, NextResponse } from 'next/server';
import { blueprintConfig } from '@/lib/blueprint-config';
import { createSessionToken, verifySessionToken, hashIp, sessionCookieOptions } from '@/lib/blueprint-session';
import { seedBlueprintDocument } from '@/lib/blueprint-schema';
import {
  countBlueprintSessionsSince,
  createBlueprintRow,
  createBlueprintSession,
  getBlueprintSession,
  recordFunnelEvent,
} from '@/lib/project-db';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST /api/blueprint/start — first half of the anonymous blueprint flow.
//
// Stores the visitor's intake text as a draft blueprint under an anonymous
// signed-cookie session (no account, no auth.users row), then hands back the
// blueprint id the run endpoint will fill in. Public on purpose (the whole
// point is a signed-out journey), so it carries the boring controls: flag gate,
// secret gate, body-size cap, per-IP rate limits (per-minute here, per-hour on
// session creation in the database), and strict text bounds from the brief.
//
// The bf_bp cookie is minted here and refreshed on every start so an active
// visitor keeps their session; it is HttpOnly + Secure + Lax and carries an
// HMAC, so a forged value dies before any database work.

const MAX_BODY_BYTES = 16_384;
const START_RATE_LIMIT = { limit: 6, windowMs: 60_000 };
const SESSION_RETENTION_DAYS = 90;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

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
  return NextResponse.json({ error: 'Could not start a blueprint right now.' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const config = blueprintConfig();

  // Dormant by default: without the flag (or a signing secret) this route does
  // not exist as far as the public is concerned.
  if (!config.enabled) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!config.sessionSecret) {
    return NextResponse.json({ error: 'Blueprint session secret not configured.' }, { status: 503 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Intake too large.' }, { status: 413 });
  }

  let body: { text?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < config.intakeMinChars) {
    return NextResponse.json({ error: 'Describe the problem in a sentence or two first.' }, { status: 400 });
  }
  if (text.length > config.intakeMaxChars) {
    return NextResponse.json(
      { error: `Keep the description under ${config.intakeMaxChars} characters.` },
      { status: 400 }
    );
  }

  const ip = clientIp(request);
  const rate = checkRateLimit(`bp:start:${ip}`, START_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, slow down.', retryAfterSeconds: rate.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    );
  }

  // Existing session from a valid cookie; anything stale or forged starts over.
  const cookie = request.cookies.get(config.sessionCookieName)?.value ?? null;
  let sessionId = verifySessionToken(cookie, config.sessionSecret);

  if (sessionId) {
    const existing = await getBlueprintSession(sessionId);
    if (!existing.ok) return dbError(existing.error);
    if (!existing.session) sessionId = null;
  }

  if (!sessionId) {
    const ipHash = hashIp(ip, config.sessionSecret);

    // Durable per-IP hourly cap on session creation: clearing cookies to mint
    // fresh sessions does not reset this one, because it lives in the database.
    if (ipHash) {
      const since = new Date(Date.now() - 3_600_000).toISOString();
      const perIp = await countBlueprintSessionsSince(ipHash, since);
      if (!perIp.ok) return dbError(perIp.error);
      if (perIp.count >= config.maxSessionsPerIpPerHour) {
        return NextResponse.json(
          { error: 'Session limit reached, try again later.', retryAfterSeconds: 3600 },
          { status: 429, headers: { 'Retry-After': '3600' } }
        );
      }
    }

    const created = await createBlueprintSession({ ipHash, retentionDays: SESSION_RETENTION_DAYS });
    if (!created.ok) return dbError(created.error);
    sessionId = created.session.id;
  }

  const draft = await createBlueprintRow(sessionId, seedBlueprintDocument(text), text);
  if (!draft.ok) return dbError(draft.error);

  // First step of the free-first journey. Recorded from the server so the
  // funnel counts real server work, not a client's claim.
  await recordFunnelEvent('blueprint_started', { properties: { source: 'landing' } });

  const response = NextResponse.json({
    blueprintId: draft.blueprint.id,
    version: draft.blueprint.version,
    status: draft.blueprint.status,
  });
  response.cookies.set(
    config.sessionCookieName,
    createSessionToken(sessionId, config.sessionSecret),
    sessionCookieOptions(config.sessionTtlDays)
  );
  return response;
}
