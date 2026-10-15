import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { completeJson } from '@/lib/blueprint-llm';
import { buildArticlePrompt, normalizeArticle } from '@/lib/article.js';
import { screenText } from '@/lib/content-policy.js';
import { getAiUsageToday } from '@/lib/project-db';
import { checkRateLimit } from '@/lib/rate-limit';
import { aiBudget, aiModels } from '@/lib/ai-tier';
import { noteFailure } from '@/lib/model-router.js';
import { withAiTier } from '@/lib/ai-tier';
import { withCraft } from '@/lib/craft.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LIMIT = { limit: 6, windowMs: 60 * 60 * 1000 };

// POST { topic, audience?, length? } -> { article }. Free to try, like the other makers: a per-person hourly limit plus the
// same daily AI ceiling, the same content policy, the standard model first and a free model as the second try.
async function handle(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const key = user ? `article:u:${user.id}` : `article:ip:${(request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'}`;
    const rate = checkRateLimit(key, LIMIT);
    if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of articles for one hour. Try again in a little while.' }, { status: 429 });
    const apiKey = String(process.env.OPENROUTER_API_KEY ?? '').trim();
    if (!apiKey) return NextResponse.json({ error: 'The writer is not available right now.' }, { status: 503 });

    const body = (await request.json().catch(() => ({}))) as { topic?: unknown; audience?: unknown; length?: unknown };
    const topic = String(body.topic ?? '').trim();
    if (topic.length < 8) return NextResponse.json({ error: 'Say what the article is about in a sentence or two.' }, { status: 400 });
    const screened = screenText(`${topic}\n${String(body.audience ?? '')}`);
    if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });
    const usage = await getAiUsageToday(null).catch(() => ({ userToday: 0, aiToday: 0 }));
    const budget = aiBudget({ userToday: 0, aiToday: usage.aiToday });
    if (!budget.allowed) return NextResponse.json({ error: budget.message }, { status: 429 });

    const length = body.length === 'short' || body.length === 'long' ? body.length : 'normal';
    const prompt = buildArticlePrompt({ topic, audience: String(body.audience ?? ''), length });
    let lastError = 'The writer is busy. Try again in a moment.';
    for (const model of aiModels()) {
      try {
        const free = model.includes(':');
        const completion = await completeJson({ apiKey, model, system: withCraft(prompt.system), user: prompt.user, temperature: 0.6, maxTokens: free ? 5000 : 2600, timeoutMs: free ? 55000 : 40000 });
        const checked = normalizeArticle(completion.text);
        if (checked.ok) return NextResponse.json({ article: checked.article });
        lastError = checked.error;
      } catch (cause) {
        noteFailure(model);
        console.warn('article model failed:', model, cause instanceof Error ? cause.message.slice(0, 160) : cause);
      }
    }
    return NextResponse.json({ error: `${lastError} Try again.` }, { status: 502 });
  } catch (error) {
    console.error('Article error:', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}

// Runs in the asker's AI tier: paying accounts get the strongest models and a bigger daily allowance.
export async function POST(request: NextRequest) {
  return withAiTier(request, () => handle(request));
}
