import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { completeJson } from '@/lib/blueprint-llm';
import { buildPlanPrompt, normalizePlan } from '@/lib/carousel-plan.js';
import { fetchPage } from '@/lib/research';
import { checkRateLimit } from '@/lib/rate-limit';
import { screenText } from '@/lib/content-policy.js';
import { budgetLimits, decideBudget } from '@/lib/ai-budget.js';
import { getAiUsageToday, recordFunnelEvent } from '@/lib/project-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Free to try: anyone can plan a carousel, so the guard is per person per hour plus the same
// global daily ceiling the chat uses. The planner is one short, token-capped call to the standard
// (cheap) model; a free model is the second try if the first cannot answer.
const PLAN_LIMIT = { limit: 8, windowMs: 60 * 60 * 1000 };
const MODELS = [process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', 'nvidia/nemotron-3-super-120b-a12b:free'];

function clientKey(request: NextRequest, userId: string | null): string {
  if (userId) return `carousel:u:${userId}`;
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return `carousel:ip:${forwarded.split(',')[0].trim() || 'unknown'}`;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const rate = checkRateLimit(clientKey(request, user?.id ?? null), PLAN_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'That is a lot of carousels for one hour. Try again in a little while.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
    }

    const apiKey = String(process.env.OPENROUTER_API_KEY ?? '').trim();
    if (!apiKey) return NextResponse.json({ error: 'The writer is not available right now.' }, { status: 503 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = body.mode === 'url' || body.mode === 'file' ? body.mode : 'words';
    const topic = String(body.topic ?? '').trim().slice(0, 1500);
    const count = Number(body.count) || 7;

    let sourceText = '';
    let sourceTitle = '';
    let sourceImage: string | null = null;
    let sourceUrl: string | null = null;

    if (mode === 'url') {
      const raw = String(body.url ?? '').trim();
      if (!raw) return NextResponse.json({ error: 'Paste the page address.' }, { status: 400 });
      try {
        const page = await fetchPage(raw, { timeoutMs: 7000, maxChars: 12000 });
        sourceText = page.text;
        sourceTitle = page.title;
        sourceImage = page.image ?? null;
        sourceUrl = page.url;
      } catch {
        return NextResponse.json({ error: 'That page could not be read. Check the address, or paste the text instead.' }, { status: 422 });
      }
      if (sourceText.length < 200) return NextResponse.json({ error: 'That page has too little text to work from. Paste the text instead.' }, { status: 422 });
    } else if (mode === 'file') {
      sourceText = String(body.text ?? '').slice(0, 12000);
      sourceTitle = String(body.name ?? 'file').slice(0, 120);
      if (sourceText.trim().length < 200) return NextResponse.json({ error: 'That file has too little text to work from.' }, { status: 422 });
    } else if (topic.length < 8) {
      return NextResponse.json({ error: 'Say what the carousel is about in a sentence.' }, { status: 400 });
    }

    const screened = screenText(`${topic}\n${sourceText.slice(0, 4000)}`);
    if (!screened.ok) return NextResponse.json({ error: screened.message, policy: screened.category }, { status: 422 });

    const usage = await getAiUsageToday(null).catch(() => ({ userToday: 0, aiToday: 0 }));
    const budget = decideBudget({ userToday: 0, aiToday: usage.aiToday }, budgetLimits(process.env));
    if (!budget.allowed) return NextResponse.json({ error: budget.message }, { status: 429 });

    const prompt = buildPlanPrompt({ mode, topic, sourceText, sourceTitle, count });
    let plan = null;
    let lastError = 'The writer is busy. Try again in a moment.';
    for (const model of MODELS) {
      try {
        const completion = await completeJson({ apiKey, model, system: prompt.system, user: prompt.user, temperature: 0.6, maxTokens: 1600, timeoutMs: model.endsWith(':free') ? 40000 : 30000 });
        const checked = normalizePlan(completion.text, { count: prompt.count });
        if (checked.ok) {
          plan = checked.plan;
          break;
        }
        lastError = checked.error;
      } catch (cause) {
        console.warn('carousel plan model failed:', model, cause instanceof Error ? cause.message.slice(0, 160) : cause);
      }
    }
    if (!plan) return NextResponse.json({ error: `${lastError} Try again, or give it a little more to work with.` }, { status: 502 });

    void recordFunnelEvent('carousel_planned', { signedIn: Boolean(user), source: 'organic', properties: { source: mode } }).catch(() => undefined);
    return NextResponse.json({ plan, source: { title: sourceTitle, image: sourceImage, url: sourceUrl } });
  } catch (error) {
    console.error('Carousel plan error:', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
