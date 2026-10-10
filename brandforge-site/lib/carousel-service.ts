import { completeJson } from '@/lib/blueprint-llm';
import { buildPlanPrompt, normalizePlan, TYPES, type CarouselPlan } from '@/lib/carousel-plan.js';
import { fetchPage, searchWeb } from '@/lib/research';
import { screenText } from '@/lib/content-policy.js';
import { budgetLimits, decideBudget } from '@/lib/ai-budget.js';
import { getAiUsageToday } from '@/lib/project-db';

// Writes the words for a carousel. One place for the website, the Telegram and Discord bots and the
// weekly calendar, so they all get the same rules: facts only from what was given or found, a
// token-capped call to the standard model, a free model as the second try, and the daily AI ceiling.
export type PlanInput = {
  mode: 'words' | 'url' | 'file';
  type?: string;
  topic?: string;
  url?: string;
  text?: string;
  name?: string;
  count?: number;
  cta?: string;
};

export type PlanResult =
  | { ok: true; plan: CarouselPlan; source: { title: string; image: string | null; url: string | null } }
  | { ok: false; status: number; error: string };

const MODELS = [process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', 'cf:@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'nvidia/nemotron-3-super-120b-a12b:free'];

async function newsSources(topic: string): Promise<{ text: string; title: string } | { error: string }> {
  const provider = process.env.SEARCH_PROVIDER || 'serper';
  const key = process.env.SEARCH_API_KEY || '';
  if (!key && provider !== 'ddg') {
    return { error: 'News and trends needs web search, which is not switched on. Paste a news page address or a text file instead.' };
  }
  try {
    const found = await searchWeb({ query: topic, num: 4, provider, apiKey: key, timeoutMs: 6000 });
    const parts: string[] = [];
    const titles: string[] = [];
    for (const result of found.results.slice(0, 3)) {
      titles.push(result.title);
      let text = result.snippet ?? '';
      try {
        const page = await fetchPage(result.url, { timeoutMs: 4000, maxChars: 3000 });
        text = page.text || text;
      } catch {
        /* the search snippet is still a real source */
      }
      parts.push(`[${result.title}] ${text}`);
    }
    const text = parts.join('\n\n');
    if (text.length < 200) return { error: 'No usable news was found for that. Try different words, or paste a page address.' };
    return { text, title: titles.join(' | ') };
  } catch {
    return { error: 'Could not search the news right now. Paste a news page address instead.' };
  }
}

export async function makeCarouselPlan(input: PlanInput): Promise<PlanResult> {
  const apiKey = String(process.env.OPENROUTER_API_KEY ?? '').trim();
  if (!apiKey) return { ok: false, status: 503, error: 'The writer is not available right now.' };

  const mode = input.mode === 'url' || input.mode === 'file' ? input.mode : 'words';
  const type = typeof input.type === 'string' && Object.prototype.hasOwnProperty.call(TYPES, input.type) ? input.type : 'list';
  const topic = String(input.topic ?? '').trim().slice(0, 1500);
  const cta = String(input.cta ?? '').trim().slice(0, 80);
  let sourceText = '';
  let sourceTitle = '';
  let sourceImage: string | null = null;
  let sourceUrl: string | null = null;

  if (mode === 'url') {
    const raw = String(input.url ?? '').trim();
    if (!raw) return { ok: false, status: 400, error: 'Paste the page address.' };
    try {
      const page = await fetchPage(raw, { timeoutMs: 7000, maxChars: 12000 });
      sourceText = page.text;
      sourceTitle = page.title;
      sourceImage = page.image ?? null;
      sourceUrl = page.url;
    } catch {
      return { ok: false, status: 422, error: 'That page could not be read. Check the address, or paste the text instead.' };
    }
    if (sourceText.length < 200) return { ok: false, status: 422, error: 'That page has too little text to work from. Paste the text instead.' };
  } else if (mode === 'file') {
    sourceText = String(input.text ?? '').slice(0, 12000);
    sourceTitle = String(input.name ?? 'file').slice(0, 120);
    if (sourceText.trim().length < 200) return { ok: false, status: 422, error: 'That file has too little text to work from.' };
  } else if (topic.length < 8) {
    return { ok: false, status: 400, error: 'Say what the carousel is about in a sentence.' };
  }

  // News and trends cannot come from the model's memory: search the web and write from what is found.
  if (type === 'news' && mode === 'words') {
    const found = await newsSources(topic);
    if ('error' in found) return { ok: false, status: 422, error: found.error };
    sourceText = found.text;
    sourceTitle = found.title;
  }

  const screened = screenText(`${topic}\n${sourceText.slice(0, 4000)}`);
  if (!screened.ok) return { ok: false, status: 422, error: screened.message };

  const usage = await getAiUsageToday(null).catch(() => ({ userToday: 0, aiToday: 0 }));
  const budget = decideBudget({ userToday: 0, aiToday: usage.aiToday }, budgetLimits(process.env));
  if (!budget.allowed) return { ok: false, status: 429, error: budget.message };

  const prompt = buildPlanPrompt({ mode, type, topic, sourceText, sourceTitle, count: input.count, cta });
  let lastError = 'The writer is busy. Try again in a moment.';
  for (const model of MODELS) {
    try {
      const completion = await completeJson({ apiKey, model, system: prompt.system, user: prompt.user, temperature: 0.6, maxTokens: model.endsWith(':free') ? 4000 : 1600, timeoutMs: model.endsWith(':free') ? 55000 : 30000 });
      const checked = normalizePlan(completion.text, { count: prompt.count, cta });
      if (checked.ok) return { ok: true, plan: checked.plan, source: { title: sourceTitle, image: sourceImage, url: sourceUrl } };
      lastError = checked.error;
    } catch (cause) {
      console.warn('carousel plan model failed:', model, cause instanceof Error ? cause.message.slice(0, 160) : cause);
    }
  }
  return { ok: false, status: 502, error: `${lastError} Try again, or give it a little more to work with.` };
}
