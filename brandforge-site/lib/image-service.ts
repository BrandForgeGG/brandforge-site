import { completeJson } from '@/lib/blueprint-llm';
import { writerChain } from '@/lib/llm-providers';
import { buildImagePrompt, normalizeImageCopy, kindOf, type ImageCopy, type ImageKind } from '@/lib/image-kinds.js';
import { screenText } from '@/lib/content-policy.js';
import { budgetLimits, decideBudget } from '@/lib/ai-budget.js';
import { getAiUsageToday } from '@/lib/project-db';

// Writes the words for one image (ad, quote, tip, announcement, poll). Same rules as the carousel writer: facts
// only from what the person gave, a token-capped call to the standard model, a free model as the second try,
// and the daily AI ceiling. One place for the chat, the website and the weekly calendar.
export type ImageCopyInput = { kind: string; topic: string; button?: string };
export type ImageCopyResult = { ok: true; kind: ImageKind; copy: ImageCopy } | { ok: false; status: number; error: string };

const MODELS = writerChain();

export async function makeImageCopy(input: ImageCopyInput): Promise<ImageCopyResult> {
  const apiKey = String(process.env.OPENROUTER_API_KEY ?? '').trim();
  if (!apiKey) return { ok: false, status: 503, error: 'The writer is not available right now.' };

  const kind = kindOf(input.kind);
  const topic = String(input.topic ?? '').trim().slice(0, 500);
  if (topic.length < 8) return { ok: false, status: 400, error: 'Say what it is about in a sentence.' };

  const screened = screenText(topic);
  if (!screened.ok) return { ok: false, status: 422, error: screened.message };

  const usage = await getAiUsageToday(null).catch(() => ({ userToday: 0, aiToday: 0 }));
  const budget = decideBudget({ userToday: 0, aiToday: usage.aiToday }, budgetLimits(process.env));
  if (!budget.allowed) return { ok: false, status: 429, error: budget.message };

  const prompt = buildImagePrompt({ kind, topic, button: input.button });
  let lastError = 'The writer is busy. Try again in a moment.';
  for (const model of MODELS) {
    try {
      const completion = await completeJson({ apiKey, model, system: prompt.system, user: prompt.user, temperature: 0.7, maxTokens: model.endsWith(':free') ? 2500 : 700, timeoutMs: model.endsWith(':free') ? 55000 : 30000 });
      const checked = normalizeImageCopy(completion.text, kind, { button: input.button });
      if (checked.ok) return { ok: true, kind, copy: checked.copy };
      lastError = checked.error;
    } catch (cause) {
      console.warn('image copy model failed:', model, cause instanceof Error ? cause.message.slice(0, 160) : cause);
    }
  }
  return { ok: false, status: 502, error: `${lastError} Try again, or give it a little more to work with.` };
}
