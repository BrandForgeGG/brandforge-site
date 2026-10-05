import { NextRequest, NextResponse } from 'next/server';
import { blueprintConfig } from '@/lib/blueprint-config';
import { verifySessionToken, consumeQuota } from '@/lib/blueprint-session';
import { normalizeBlueprint, validateBlueprint } from '@/lib/blueprint-schema';
import { SYSTEM, buildRunPrompt, buildRepairPrompt, parseModelJson } from '@/lib/blueprint-prompt';
import { completeJson } from '@/lib/blueprint-llm';
import { runResearch, PLANNER_SYSTEM } from '@/lib/research';
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

// POST /api/blueprint/run — second half of the anonymous flow: turn a stored
// draft into a validated blueprint document with one LLM synthesis call (plus
// at most one repair pass when validation fails).
//
// Gates, in order: feature flag -> per-IP hourly backstop -> JSON body ->
// signed session cookie -> durable per-session daily quota -> ownership ->
// LLM -> validation -> save. Quota is only consumed when the provider
// actually returned work, so an outage never burns a visitor's runs.
//
// The document that lands in the response is exactly the document that was
// validated: normalisation computes the server-side fields (exits, cost,
// timestamps) and validation then signs off on the final shape.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_RATE_LIMIT = { limit: 10, windowMs: 3_600_000 };

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
  const rate = checkRateLimit(`bp:run:${ip}`, RUN_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, try again later.', retryAfterSeconds: rate.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    );
  }

  let body: { blueprintId?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const blueprintId = typeof body.blueprintId === 'string' ? body.blueprintId.trim() : '';
  if (!UUID_PATTERN.test(blueprintId)) {
    return NextResponse.json({ error: 'blueprintId must be a uuid.' }, { status: 400 });
  }

  // Session: an HMAC-valid cookie that still resolves to a live row.
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
  const session = sessionResult.session;

  // Durable daily quota per session (UTC day, rolled in lib/blueprint-session).
  const quota = consumeQuota(session, { limit: config.runsPerSessionPerDay });
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
  if (blueprint.status !== 'draft' && blueprint.status !== 'validated') {
    return NextResponse.json({ error: 'This blueprint is locked after conversion.' }, { status: 409 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Blueprint planner is not configured.' }, { status: 503 });
  }

  const seed = blueprint.document as { sources?: unknown };
  const sources = Array.isArray(seed.sources) ? (seed.sources as Array<Record<string, unknown>>) : [];

  // Research stage (brief 4.5): plan queries with the cheap tier, search and
  // fetch inside a small wall-clock budget. runResearch never throws and
  // returns an empty pack unless BLUEPRINT_RESEARCH is on and SEARCH_API_KEY
  // is set, so this code is inert until the founder wires a provider.
  const research = await runResearch({
    input: blueprint.input,
    config,
    ask: async (plannerPrompt, timeoutMs) => {
      const plan = await completeJson({
        apiKey,
        model: config.extractModel,
        system: PLANNER_SYSTEM,
        user: plannerPrompt,
        timeoutMs: timeoutMs ?? 4000,
      });
      return plan.text;
    },
  });
  const fetchedUrls = research.pages.map((page) => page.url);
  // Token counts come from whichever LLM call produced the document; search
  // counts and research dollars belong to the run and are added either way.
  const runCost = (tokens: { tokensIn: number; tokensOut: number; usdEstimate?: number }) => ({
    tokensIn: tokens.tokensIn,
    tokensOut: tokens.tokensOut,
    searches: research.searches,
    usdEstimate: (Number(tokens.usdEstimate) || 0) + research.usdEstimate,
  });

  const prompt = buildRunPrompt({
    input: blueprint.input,
    sources,
    research: research.pages,
  });

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
      console.error('Blueprint run: primary LLM call failed:', error instanceof Error ? error.message : error);
      return NextResponse.json(
        { error: 'The planner is busy right now. Try again in a moment.' },
        { status: 502 }
      );
    }

    const raw = parseModelJson(completion.text);
    let document = raw ? normalizeBlueprint(raw, { version: blueprint.version, cost: runCost(completion) }) : null;
    let validation = document
      ? validateBlueprint(document, { fetchedUrls })
      : { ok: false, errors: ['model output was not a JSON object'] };

    // One repair pass (brief 4.6): everything the validator rejected — up to
    // and including an unparseable response — goes back to the model once. A
    // second failure is terminal for this attempt.
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
        console.error('Blueprint run: repair LLM call failed:', error instanceof Error ? error.message : error);
        repair = null;
      }

      if (repair) {
        const repairedRaw = parseModelJson(repair.text);
        const repaired = repairedRaw
          ? normalizeBlueprint(repairedRaw, { version: blueprint.version, cost: runCost(repair) })
          : null;
        const repairedValidation = repaired
          ? validateBlueprint(repaired, { fetchedUrls })
          : { ok: false, errors: ['repair output was not a JSON object'] };
        if (repaired && repairedValidation.ok) {
          document = repaired;
          validation = repairedValidation;
        } else {
          console.error('Blueprint run: repair still invalid:', repairedValidation.errors.slice(0, 8).join(' | '));
        }
      }
    }

    if (!document || !validation.ok) {
      console.error('Blueprint run: validation failed after repair:', validation.errors.slice(0, 8).join(' | '));
      return NextResponse.json(
        { error: 'Could not assemble a blueprint from that description. Try rephrasing it.' },
        { status: 502 }
      );
    }

    const saved = await saveBlueprintResult({
      id: blueprintId,
      sessionId,
      document,
      lane: String(document.lane),
      confidence: document.confidence === null ? null : String(document.confidence),
      status: 'validated',
    });
    if (!saved.ok) return dbError(saved.error);

    // History: every validated version lands in blueprint_revisions (v1 here,
    // v2+ in refine) so nothing is ever overwritten without a trace.
    const revision = await createBlueprintRevision(blueprintId, saved.blueprint.version, document);
    if (!revision.ok) {
      console.error('Blueprint run: revision insert failed:', revision.error);
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
    // Consume the run only when the provider actually did work: an outage
    // costs us nothing to retry from the visitor's side.
    if (workDone) {
      const persisted = await recordBlueprintRun(sessionId, {
        quotaDate: quota.quotaDate,
        quotaCount: quota.quotaCount,
      });
      if (!persisted.ok) {
        console.error('Blueprint run: quota write failed:', persisted.error);
      }
    }
  }
}
