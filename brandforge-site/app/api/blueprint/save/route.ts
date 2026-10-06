import { NextRequest, NextResponse } from 'next/server';
import { blueprintConfig } from '@/lib/blueprint-config';
import { createSessionToken, verifySessionToken } from '@/lib/blueprint-session';
import {
  getBlueprintSession,
  getBlueprintRow,
  saveBlueprintEmail,
  recordFunnelEvent,
  updateBlueprintEmbedMessage,
} from '@/lib/project-db';
import { checkRateLimit } from '@/lib/rate-limit';
import { isValidEmail } from '@/lib/auth-utils';
import { sendStageEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

// POST /api/blueprint/save — master brief 6: the email gate. The visitor's
// address is stored first (status -> 'saved'), the funnel counts the capture,
// and only then is the return-link email sent — a mail-provider hiccup must
// never lose the save, so a failed send is reported honestly and a retry
// simply re-sends against the already-saved row.
//
// Gate position travels with the event (brief 13): the client says where the
// gate rendered; the server keeps the founder's default as the fallback.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAVE_RATE_LIMIT = { limit: 6, windowMs: 60_000 };
const GATE_POSITIONS = new Set(['before_price', 'after_price', 'at_save']);
const DEFAULT_GATE_POSITION = 'before_price';
const EMAIL_MAX_CHARS = 254;

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
  return NextResponse.json({ error: 'Blueprint storage failed.' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const config = blueprintConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!config.sessionSecret) {
    return NextResponse.json({ error: 'Blueprint session secret not configured.' }, { status: 503 });
  }

  const ip = clientIp(request);
  const rate = checkRateLimit(`bp:save:${ip}`, SAVE_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, try again later.', retryAfterSeconds: rate.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    );
  }

  let body: { blueprintId?: unknown; email?: unknown; gate?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const blueprintId = typeof body.blueprintId === 'string' ? body.blueprintId.trim() : '';
  if (!UUID_PATTERN.test(blueprintId)) {
    return NextResponse.json({ error: 'blueprintId must be a uuid.' }, { status: 400 });
  }

  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > EMAIL_MAX_CHARS || !isValidEmail(email)) {
    return NextResponse.json(
      { error: 'Enter a valid email address so the link has somewhere to go.' },
      { status: 400 }
    );
  }

  const cookie = request.cookies.get(config.sessionCookieName)?.value ?? null;
  const sessionId = verifySessionToken(cookie, config.sessionSecret);
  if (!sessionId) {
    return NextResponse.json({ error: 'Start a blueprint first.' }, { status: 401 });
  }

  const sessionResult = await getBlueprintSession(sessionId);
  if (!sessionResult.ok) return dbError(sessionResult.error);
  if (!sessionResult.session) {
    return NextResponse.json({ error: 'Session expired, start again.' }, { status: 401 });
  }

  const owned = await getBlueprintRow(blueprintId, sessionId);
  if (!owned.ok) return dbError(owned.error);
  if (!owned.blueprint) {
    return NextResponse.json({ error: 'Blueprint not found.' }, { status: 404 });
  }
  const status = owned.blueprint.status;
  if (status === 'draft') {
    return NextResponse.json(
      { error: 'This blueprint has not been drafted yet.' },
      { status: 409 }
    );
  }
  if (status !== 'validated' && status !== 'saved') {
    return NextResponse.json(
      { error: 'This blueprint is already with the team.' },
      { status: 409 }
    );
  }

  const saved = await saveBlueprintEmail(blueprintId, sessionId, email);
  if (!saved.ok) {
    if (saved.error === 'not_found') {
      return NextResponse.json({ error: 'Blueprint not found.' }, { status: 404 });
    }
    return dbError(saved.error);
  }

  const gate =
    typeof body.gate === 'string' && GATE_POSITIONS.has(body.gate)
      ? body.gate
      : DEFAULT_GATE_POSITION;
  await recordFunnelEvent('blueprint_email_captured', { properties: { gate } });

  // Chat embedding (redesign slice B): the card in the conversation flips to
  // its emailed state so a reload doesn't ask again. Best-effort — the save
  // itself already landed and the client holds its own sent state.
  const conversationId = owned.blueprint.conversation_id ?? null;
  if (conversationId) {
    const embedUpdate = await updateBlueprintEmbedMessage(conversationId, blueprintId, {
      type: 'blueprint',
      id: blueprintId,
      status: saved.blueprint.status,
      version: saved.blueprint.version,
      document: owned.blueprint.document,
      emailed: true,
    });
    if (!embedUpdate.ok) {
      console.error('Blueprint save: embed message update failed:', embedUpdate.error);
    }
  }

  // The sign-in destination now points at the conversation the blueprint
  // lives in (or the chat shell's blueprint panel when attach could not run).
  const origin = new URL(request.url).origin;
  const returnUrl = `${origin}/api/blueprint/return?token=${encodeURIComponent(
    createSessionToken(sessionId, config.sessionSecret)
  )}`;
  const nextPath = conversationId ? `/chat?conversationId=${encodeURIComponent(conversationId)}` : '/chat?blueprint=1';
  const keepUrl = `${origin}/login?next=${encodeURIComponent(nextPath)}`;

  const sent = await sendStageEmail('blueprint_saved', email, { returnUrl, keepUrl });
  if (!sent.ok) {
    console.error('Blueprint save: return-link email failed:', sent.error ?? 'unknown');
    return NextResponse.json(
      { error: 'Saved, but the return-link email could not be sent. Try again.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, status: saved.blueprint.status, emailed: true });
}
