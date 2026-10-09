import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { completeJson } from '@/lib/blueprint-llm';
import { normalizePlan } from '@/lib/carousel-plan.js';
import { buildCaptionPrompt, fallbackCaptions, normalizeCaptions } from '@/lib/carousel-captions.js';
import { checkRateLimit } from '@/lib/rate-limit';
import { screenText } from '@/lib/content-policy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LIMIT = { limit: 12, windowMs: 60 * 60 * 1000 };
const MODELS = [process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', 'nvidia/nemotron-3-super-120b-a12b:free'];

// POST /api/carousel/captions: one caption per platform, written from the carousel's own words.
// Free to try. If no model answers, captions built from the carousel itself come back instead, so the
// Distribute step always has something real to copy.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const forwarded = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const rate = checkRateLimit(user ? `captions:u:${user.id}` : `captions:ip:${forwarded}`, LIMIT);
    if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of captions for one hour. Try again later.' }, { status: 429 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    // The plan is re-validated, so a hand-made request can never push oversized or odd data to the model.
    const checked = normalizePlan(body.plan, { count: 10 });
    if (!checked.ok) return NextResponse.json({ error: 'Make a carousel first.' }, { status: 400 });
    const topic = String(body.topic ?? '').slice(0, 300);
    const brand = (body.brand && typeof body.brand === 'object' ? body.brand : {}) as Record<string, unknown>;
    const cta = String(body.cta ?? '').slice(0, 100);

    const screened = screenText(`${topic}\n${checked.plan.cover.headline}`);
    if (!screened.ok) return NextResponse.json({ error: screened.message, policy: screened.category }, { status: 422 });

    const fallback = fallbackCaptions(checked.plan, cta);
    const apiKey = String(process.env.OPENROUTER_API_KEY ?? '').trim();
    if (!apiKey) return NextResponse.json({ captions: fallback, written: false });

    const prompt = buildCaptionPrompt({ plan: checked.plan, topic, brandName: String(brand.name ?? '').slice(0, 40), handle: String(brand.handle ?? '').slice(0, 40), cta });
    for (const model of MODELS) {
      try {
        const completion = await completeJson({ apiKey, model, system: prompt.system, user: prompt.user, temperature: 0.7, maxTokens: 1400, timeoutMs: model.endsWith(':free') ? 40000 : 30000 });
        const parsed = normalizeCaptions(completion.text);
        if (parsed.ok) return NextResponse.json({ captions: parsed.captions, written: true });
      } catch (cause) {
        console.warn('carousel captions model failed:', model, cause instanceof Error ? cause.message.slice(0, 160) : cause);
      }
    }
    return NextResponse.json({ captions: fallback, written: false });
  } catch (error) {
    console.error('Carousel captions error:', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
