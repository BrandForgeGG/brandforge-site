import { completeJson } from '@/lib/blueprint-llm';
import { buildImagePrompt, normalizeImageCopy, kindOf, type ImageCopy, type ImageKind } from '@/lib/image-kinds.js';
import { screenText } from '@/lib/content-policy.js';
import { getAiUsageToday } from '@/lib/project-db';
import { aiBudget, aiModels } from '@/lib/ai-tier';
import { noteFailure } from '@/lib/model-router.js';
import { withCraft } from '@/lib/craft.js';

// Writes the words for one image (ad, quote, tip, announcement, poll). Same rules as the carousel writer: facts
// only from what the person gave, a token-capped call to the standard model, a free model as the second try,
// and the daily AI ceiling. One place for the chat, the website and the weekly calendar.
export type ImageCopyInput = { kind: string; topic: string; button?: string };
export type ImageCopyResult = { ok: true; kind: ImageKind; copy: ImageCopy } | { ok: false; status: number; error: string };


export async function makeImageCopy(input: ImageCopyInput): Promise<ImageCopyResult> {
  const apiKey = String(process.env.OPENROUTER_API_KEY ?? '').trim();
  if (!apiKey) return { ok: false, status: 503, error: 'The writer is not available right now.' };

  const kind = kindOf(input.kind);
  const topic = String(input.topic ?? '').trim().slice(0, 500);
  if (topic.length < 8) return { ok: false, status: 400, error: 'Say what it is about in a sentence.' };

  const screened = screenText(topic);
  if (!screened.ok) return { ok: false, status: 422, error: screened.message };

  const usage = await getAiUsageToday(null).catch(() => ({ userToday: 0, aiToday: 0 }));
  const budget = aiBudget({ userToday: 0, aiToday: usage.aiToday });
  if (!budget.allowed) return { ok: false, status: 429, error: budget.message };

  const prompt = buildImagePrompt({ kind, topic, button: input.button });
  let lastError = 'The writer is busy. Try again in a moment.';
  for (const model of aiModels()) {
    try {
      const completion = await completeJson({ apiKey, model, system: withCraft(prompt.system), user: prompt.user, temperature: 0.7, maxTokens: model.includes(':') ? 2500 : 700, timeoutMs: model.includes(':') ? 55000 : 30000 });
      const checked = normalizeImageCopy(completion.text, kind, { button: input.button });
      if (checked.ok) return { ok: true, kind, copy: checked.copy };
      lastError = checked.error;
    } catch (cause) {
      noteFailure(model);
      console.warn('image copy model failed:', model, cause instanceof Error ? cause.message.slice(0, 160) : cause);
    }
  }
  return { ok: false, status: 502, error: `${lastError} Try again, or give it a little more to work with.` };
}
