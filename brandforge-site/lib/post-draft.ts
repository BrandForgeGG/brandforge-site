import { completeJson } from '@/lib/blueprint-llm';
import { extractJson } from '@/lib/carousel-plan.js';
import { normalizePost, type Post, type PostType } from '@/lib/post-types.js';
import { screenText } from '@/lib/content-policy.js';
import { budgetLimits, decideBudget } from '@/lib/ai-budget.js';
import { getAiUsageToday } from '@/lib/project-db';

// Writes the first draft of an update, poll, quiz or thread from one sentence. The person edits it before
// anything is posted. Same rules as the carousel writer: facts only from what they gave, a token-capped
// call to the standard model, a free model as the second try, and the daily AI ceiling.
const MODELS = [process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', 'nvidia/nemotron-3-super-120b-a12b:free'];

const SHAPES: Record<PostType, string> = {
  update:
    'Write ONE short social post of at most 90 words. Plain, specific, warm. Put **double asterisks** around at most two key phrases. No hashtags, no emoji. Output {"text":"..."}.',
  poll:
    'Write ONE poll for a community: a clear question of at most 20 words and three or four short answers of at most 6 words each, each genuinely different. Output {"question":"...","options":["...","..."]}.',
  quiz:
    'Write ONE quiz question with exactly four answers of at most 6 words each. Exactly one is right, and you must be certain it is right and well known; if the topic needs facts you do not have, make it about general reasoning instead. correct is the zero-based index of the right answer. explanation is one short sentence. Output {"question":"...","options":["...","...","...","..."],"correct":0,"explanation":"..."}.',
  thread:
    'Write a thread of five or six posts. Post 1 is a hook that makes people want to read on. Each post is at most 240 characters, one idea, plain words. The last post says what to do next. No hashtags, no numbering (numbers are added for you). Output {"parts":["...","..."]}.',
};

const SYSTEM =
  "You write social posts for a founder, a small business or a creator. You output ONLY one JSON object, no prose and no code fences. Use ONLY facts in the person's text. Never invent numbers, prices, quotes, results or claims. Never mention any brand, website or handle the person did not give you. Write in the same language as the person's input.";

export type DraftResult = { ok: true; post: Post } | { ok: false; status: number; error: string };

export async function makePostDraft(type: PostType, topic: string): Promise<DraftResult> {
  const apiKey = String(process.env.OPENROUTER_API_KEY ?? '').trim();
  if (!apiKey) return { ok: false, status: 503, error: 'The writer is not available right now.' };
  const words = topic.trim().slice(0, 800);
  if (words.length < 8) return { ok: false, status: 400, error: 'Say what it is about in a sentence.' };
  const screened = screenText(words);
  if (!screened.ok) return { ok: false, status: 422, error: screened.message };
  const usage = await getAiUsageToday(null).catch(() => ({ userToday: 0, aiToday: 0 }));
  const budget = decideBudget({ userToday: 0, aiToday: usage.aiToday }, budgetLimits(process.env));
  if (!budget.allowed) return { ok: false, status: 429, error: budget.message };

  let lastError = 'The writer is busy. Try again in a moment.';
  for (const model of MODELS) {
    try {
      const completion = await completeJson({
        apiKey,
        model,
        system: `${SYSTEM}\n\n${SHAPES[type]}`,
        user: `What the post is about:\n${words}`,
        temperature: 0.7,
        maxTokens: 700,
        timeoutMs: model.endsWith(':free') ? 40000 : 25000,
      });
      const raw = extractJson(completion.text) as Record<string, unknown> | null;
      const checked = normalizePost({ ...(raw ?? {}), type });
      if (checked.ok) return { ok: true, post: checked.post };
      lastError = checked.error;
    } catch (cause) {
      console.warn('post draft model failed:', model, cause instanceof Error ? cause.message.slice(0, 160) : cause);
    }
  }
  return { ok: false, status: 502, error: `${lastError} Try again, or write it yourself.` };
}
