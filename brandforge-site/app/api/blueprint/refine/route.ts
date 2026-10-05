import { NextRequest, NextResponse } from 'next/server';
import { blueprintConfig } from '@/lib/blueprint-config';
import { verifySessionToken, consumeQuota } from '@/lib/blueprint-session';
import { normalizeBlueprint, validateBlueprint } from '@/lib/blueprint-schema';
import { SYSTEM, buildRefinePrompt, buildRepairPrompt, parseModelJson, carriedResearch } from '@/lib/blueprint-prompt';
import { completeJson } from '@/lib/blueprint-llm';
import {
  createBlueprintRevision,
  getBlueprintSession,
  getBlueprintRow,
  recordBlueprintRun,
  saveBlueprintResult,
} from '@/lib/project-db';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/blueprint/refine — brief 4.7: the visitor's note revises the
// validated blueprint into a new version. Same gates as /run (flag, rate,
// session, quota, ownership), plus: the blueprint must be in a validated or
// saved state, and the note must be a real note.
//
// Version discipline: the document is fully re-validated like any run (a
// refine that breaks the contract is repaired once, then rejected), the
// version increments, and the previous version is preserved in
// blueprint_revisions — never overwritten in place.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFINE_RATE_LIMIT = { limit: 10, windowMs: 3_600_000 };
const NOTE_MIN_CHARS = 3;
const NOTE_MAX_CHARS = 500;

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
  const rate = checkRateLimit(`bp:refine:${ip}`, REFINE_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, try again later.', retryAfterSeconds: rate.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    );
  }

  let body: { blueprintId?: unknown; note?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const blueprintId = typeof body.blueprintId === 'string' ? body.blueprintId.trim() : '';
  if (!UUID_PATTERN.test(blueprintId)) {
    return NextResponse.json({ error: 'blueprintId must be a uuid.' }, { status: 400 });
  }

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length < NOTE_MIN_CHARS || note.length > NOTE_MAX_CHARS) {
    return NextResponse.json(
      { error: `Tell us what to change in ${NOTE_MIN_CHARS}–${NOTE_MAX_CHARS} characters.` },
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

  const quota = consumeQuota(sessionResult.session, { limit: config.runsPerSessionPerDay });
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'Daily blueprint limit reached for this device. Come back tomorrow.', retryAfterSeconds: 3600 },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  const owned = await getBlueprintRow(blueprintId, sessionId);
  if (!owned.ok) return dbError(owned.error);
  if (!owned.blueprint) {
    return NextResponse.json({ error: 'Blueprint not found.' }, { status: 404 });
  }
  const blueprint = owned.blueprint;
  // 'saved' (email captured) stays refineable — the visitor saved first and is
  // still shaping the document; only a converted blueprint leaves the lane.
  if (blueprint.status !== 'validated' && blueprint.status !== 'saved') {
    return NextResponse.json({ error: 'Only a validated blueprint can be refined.' }, { status: 409 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Blueprint planner is not configured.' }, { status: 503 });
  }

  const seed = blueprint.document as { sources?: unknown };
  // Research urls already cited by this document were fetched when the version
  // was created: the model may keep citing them across a refine, so the
  // validator's "was it fetched" check resolves against this carried list.
  const fetchedUrls = carriedResearch(blueprint.document).map((page) => page.url);
  const prompt = buildRefinePrompt({
    input: blueprint.input,
    sources: Array.isArray(seed.sources) ? (seed.sources as Array<Record<string, unknown>>) : [],
    document: blueprint.document,
    note,
  });

  const nextVersion = blueprint.version + 1;
  let workDone = false;

  try {
    let completion;
    try {
      completion = await completeJson({
        apiKey,
        model: config.synthModel,
        system: SYSTEM,
        user: prompt,
        timeoutMs: config.llmTimeoutMs,
      });
      workDone = true;
    } catch (error) {
      console.error('Blueprint refine: primary LLM call failed:', error instanceof Error ? error.message : error);
      return NextResponse.json(
        { error: 'The planner is busy right now. Try again in a moment.' },
        { status: 502 }
      );
    }

    const raw = parseModelJson(completion.text);
    let document = raw ? normalizeBlueprint(raw, { version: nextVersion, cost: completion }) : null;
    let validation = document
      ? validateBlueprint(document, { fetchedUrls })
      : { ok: false, errors: ['model output was not a JSON object'] };

    if (!validation.ok) {
      let repair;
      try {
        repair = await completeJson({
          apiKey,
          model: config.synthModel,
          system: SYSTEM,
          user: buildRepairPrompt({ previousJson: completion.text, errors: validation.errors }),
          timeoutMs: config.llmTimeoutMs,
        });
      } catch (error) {
        console.error('Blueprint refine: repair LLM call failed:', error instanceof Error ? error.message : error);
        repair = null;
      }

      if (repair) {
        const repairedRaw = parseModelJson(repair.text);
        const repaired = repairedRaw
          ? normalizeBlueprint(repairedRaw, { version: nextVersion, cost: repair })
          : null;
        const repairedValidation = repaired
          ? validateBlueprint(repaired, { fetchedUrls })
          : { ok: false, errors: ['repair output was not a JSON object'] };
        if (repaired && repairedValidation.ok) {
          document = repaired;
          validation = repairedValidation;
        } else {
          console.error('Blueprint refine: repair still invalid:', repairedValidation.errors.slice(0, 8).join(' | '));
        }
      }
    }

    if (!document || !validation.ok) {
      console.error('Blueprint refine: validation failed after repair:', validation.errors.slice(0, 8).join(' | '));
      return NextResponse.json(
        { error: 'That change could not be applied cleanly. Word it differently and try again.' },
        { status: 502 }
      );
    }

    const saved = await saveBlueprintResult({
      id: blueprintId,
      sessionId,
      document,
      lane: String(document.lane),
      confidence: document.confidence === null ? null : String(document.confidence),
      // Refining a saved blueprint keeps it saved (the email stays attached);
      // a first draft stays validated. Never regress a status.
      status: blueprint.status === 'saved' ? 'saved' : 'validated',
      version: nextVersion,
    });
    if (!saved.ok) return dbError(saved.error);

    const revision = await createBlueprintRevision(blueprintId, nextVersion, document);
    if (!revision.ok) {
      console.error('Blueprint refine: revision insert failed:', revision.error);
    }

    return NextResponse.json({
      blueprintId: saved.blueprint.id,
      version: saved.blueprint.version,
      status: saved.blueprint.status,
      lane: saved.blueprint.lane,
      confidence: saved.blueprint.confidence,
      document: saved.blueprint.document,
    });
  } finally {
    if (workDone) {
      const persisted = await recordBlueprintRun(sessionId, {
        quotaDate: quota.quotaDate,
        quotaCount: quota.quotaCount,
      });
      if (!persisted.ok) {
        console.error('Blueprint refine: quota write failed:', persisted.error);
      }
    }
  }
}
