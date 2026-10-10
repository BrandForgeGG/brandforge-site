import { completeJson } from '@/lib/blueprint-llm';
import { writerChain } from '@/lib/llm-providers';
import { extractJson } from '@/lib/carousel-plan.js';
import { screenText } from '@/lib/content-policy.js';
import { budgetLimits, decideBudget } from '@/lib/ai-budget.js';
import { getAiUsageToday } from '@/lib/project-db';

// Sharpens a person's own copy: three stronger versions with the reason each is stronger, and a short honest
// critique of the original. It only rearranges and tightens what the person wrote; it never adds claims,
// numbers or offers they did not give. Same guards as the other writers: policy screen, daily AI ceiling,
// a token-capped standard model first and a free model as the second try.
const MODELS = writerChain();

export const KINDS = {
  hook: 'the first line of a post, built to stop the scroll',
  caption: 'a social media caption',
  headline: 'a headline or page title',
  ad: 'a short ad',
} as const;
export type SharpenKind = keyof typeof KINDS;

export type Sharpened = { notes: string[]; variants: { text: string; why: string }[] };
export type SharpenResult = { ok: true; result: Sharpened } | { ok: false; status: number; error: string };

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeSharpened(raw: unknown): Sharpened | null {
  const data = raw && typeof raw === 'object' ? (raw as { notes?: unknown; variants?: unknown }) : null;
  if (!data) return null;
  const variants = (Array.isArray(data.variants) ? data.variants : [])
    .map((entry) => {
      const item = entry as { text?: unknown; why?: unknown };
      return { text: clean(item?.text, 600), why: clean(item?.why, 160) };
    })
    .filter((entry) => entry.text.length >= 3)
    .slice(0, 3);
  if (variants.length === 0) return null;
  const notes = (Array.isArray(data.notes) ? data.notes : []).map((note) => clean(note, 160)).filter(Boolean).slice(0, 3);
  return { notes, variants };
}

export async function sharpen(kind: SharpenKind, text: string): Promise<SharpenResult> {
  const apiKey = String(process.env.OPENROUTER_API_KEY ?? '').trim();
  if (!apiKey) return { ok: false, status: 503, error: 'The editor is not available right now.' };
  const words = text.trim().slice(0, 1200);
  if (words.length < 8) return { ok: false, status: 400, error: 'Paste a little more to work with.' };
  const screened = screenText(words);
  if (!screened.ok) return { ok: false, status: 422, error: screened.message };
  const usage = await getAiUsageToday(null).catch(() => ({ userToday: 0, aiToday: 0 }));
  const budget = decideBudget({ userToday: 0, aiToday: usage.aiToday }, budgetLimits(process.env));
  if (!budget.allowed) return { ok: false, status: 429, error: budget.message };

  const system = `You are a sharp editor. The person gives you ${KINDS[kind]}. Output ONLY one JSON object: {"notes":["...","..."],"variants":[{"text":"...","why":"..."},{"text":"...","why":"..."},{"text":"...","why":"..."}]}.
- notes: two short, honest observations about what is weak or missing in the original (at most 14 words each).
- variants: exactly three genuinely different rewrites, each as long as the original or shorter. why: one short sentence saying what makes it stronger.
- Use ONLY the facts in the original. Never add numbers, prices, offers, results, awards, names or claims that are not there. If the original has little to work with, say so in a note and tighten what exists.
- Write in the same language as the original. No hashtags, no emoji unless the original had them.`;

  let lastError = 'The editor is busy. Try again in a moment.';
  for (const model of MODELS) {
    try {
      const completion = await completeJson({ apiKey, model, system, user: words, temperature: 0.7, maxTokens: model.endsWith(':free') ? 3000 : 900, timeoutMs: model.endsWith(':free') ? 40000 : 25000 });
      const result = normalizeSharpened(extractJson(completion.text));
      if (result) return { ok: true, result };
      lastError = 'The editor sent back something unreadable.';
    } catch (cause) {
      console.warn('sharpen model failed:', model, cause instanceof Error ? cause.message.slice(0, 160) : cause);
    }
  }
  return { ok: false, status: 502, error: `${lastError} Try again.` };
}
