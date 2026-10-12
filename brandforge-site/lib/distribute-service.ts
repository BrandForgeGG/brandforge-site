import { completeJson } from '@/lib/blueprint-llm';
import { writerChain } from '@/lib/llm-providers';
import { fetchPage } from '@/lib/research';
import { screenText } from '@/lib/content-policy.js';
import { budgetLimits, decideBudget } from '@/lib/ai-budget.js';
import { getAiUsageToday } from '@/lib/project-db';
import { extractUrls } from '@/lib/trade-research.js';
import {
  anglesFor,
  assembleWeek,
  buildAnglesPrompt,
  buildDayPrompt,
  closingsFor,
  layoutWeek,
  NO_SITE_ASKS,
  normalizeAngles,
  normalizeDay,
  perDayOf,
  startOf,
  type PlannedDay,
} from '@/lib/distribute-plan.js';

// Writes a person's week of posts from a sentence, a link or a file, in two steps the page can show one after the other:
//   1. makeBrief: read what they gave, decide what to say all week (the angles). Quick, and it returns first.
//   2. writeDay: write one day's captions and picture words. The page asks for the seven days a few at a time and fills the
//      calendar in as each arrives; a day the writer cannot finish still comes back with plain posts, flagged, and can be
//      asked for again. makeDistributePlan runs both steps together for callers that want the whole week in one call.
export type DistributeInput = { text?: string; url?: string; fileText?: string; fileName?: string; perDay?: number; startDate?: string; brand?: string };
export type DistributeBrief = { start: string; perDay: number; summary: string; voice: string; angles: string[]; site: string; brand: string; seed: string; source: 'text' | 'link' | 'file' };
export type DistributePlan = { start: string; perDay: number; summary: string; voice: string; site: string; source: 'text' | 'link' | 'file'; days: PlannedDay[]; plainDays: number };
export type BriefResult = { ok: true; brief: DistributeBrief } | { ok: false; status: number; error: string };
export type DistributeResult = { ok: true; plan: DistributePlan } | { ok: false; status: number; error: string };

const MODELS = writerChain();

async function ask(system: string, user: string, until: number, maxTokens: number): Promise<string | null> {
  const apiKey = String(process.env.OPENROUTER_API_KEY ?? '').trim();
  for (const model of MODELS) {
    const left = until - Date.now();
    if (left < 4000) return null;
    const free = model.endsWith(':free');
    try {
      const completion = await completeJson({ apiKey, model, system, user, temperature: 0.7, maxTokens: free ? maxTokens * 3 : maxTokens, timeoutMs: Math.min(free ? 40_000 : 22_000, left) });
      return completion.text;
    } catch (cause) {
      console.warn('distribute model failed:', model, cause instanceof Error ? cause.message.slice(0, 120) : cause);
    }
  }
  return null;
}

// ---- Step 1: the brief ----

export async function makeBrief(input: DistributeInput): Promise<BriefResult> {
  if (!String(process.env.OPENROUTER_API_KEY ?? '').trim()) return { ok: false, status: 503, error: 'The writer is not available right now.' };
  const until = Date.now() + 44_000;

  const typed = String(input.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 2500);
  const fileText = String(input.fileText ?? '').trim().slice(0, 6000);
  const link = String(input.url ?? '').trim() || extractUrls(typed, 1)[0] || '';

  const parts: string[] = [];
  let source: DistributeBrief['source'] = 'text';
  let site = '';
  if (typed) parts.push(`In their own words: ${typed}`);
  if (fileText) {
    parts.push(`From the file "${String(input.fileName ?? 'file').slice(0, 80)}":\n${fileText}`);
    source = 'file';
  }
  if (link) {
    try {
      const page = await fetchPage(link, { timeoutMs: 7000, maxChars: 5000 });
      if (page.text.trim().length >= 80) {
        parts.push(`From their page ${page.url} (title: ${page.title}):\n${page.text}`);
        site = new URL(page.url).host.replace(/^www\./, '');
        source = 'link';
      }
    } catch {
      /* the other words are still a source; the plan says nothing about a page it could not read */
    }
  }
  const sourceText = parts.join('\n\n');
  if (sourceText.replace(/\s+/g, ' ').length < 20) return { ok: false, status: 400, error: link ? 'That page could not be read. Say a little about it in words, or attach a file.' : 'Say what you want to promote, paste a link, or attach a file.' };

  const screened = screenText(sourceText.slice(0, 5000));
  if (!screened.ok) return { ok: false, status: 422, error: screened.message };

  const usage = await getAiUsageToday(null).catch(() => ({ userToday: 0, aiToday: 0 }));
  const budget = decideBudget({ userToday: 0, aiToday: usage.aiToday }, budgetLimits(process.env));
  if (!budget.allowed) return { ok: false, status: 429, error: budget.message };

  const perDay = perDayOf(input.perDay);
  const start = startOf(input.startDate);
  const brand = String(input.brand ?? '').trim().slice(0, 60);
  const total = perDay * 7;
  const prompt = buildAnglesPrompt({ source: sourceText, count: total, site });
  let planned: ReturnType<typeof normalizeAngles> = { ok: false, error: 'The plan came back unreadable.' };
  for (let attempt = 0; attempt < 2 && !planned.ok; attempt++) {
    const reply = await ask(prompt.system, prompt.user, until, 1400);
    if (reply) planned = normalizeAngles(reply, total);
  }
  if (!planned.ok) return { ok: false, status: 502, error: 'The writer is busy. Try again in a moment, or give it a little more to work with.' };

  return { ok: true, brief: { start, perDay, summary: planned.summary, voice: planned.voice, angles: planned.angles, site, brand, seed: `${start}:${site || typed.slice(0, 24) || 'x'}`, source } };
}

// ---- Step 2: one day ----

/** The empty week for a brief: the same one every call rebuilds, so the page and the server always agree. */
export function weekFor(brief: DistributeBrief) {
  return layoutWeek({ startDate: brief.start, perDay: brief.perDay, seed: brief.seed, allow: brief.site ? undefined : NO_SITE_ASKS });
}

/** Writes one day. Always returns a full day: posts the writer could not do are plain ones, flagged `fallback`. */
export async function writeDay(brief: DistributeBrief, dayIndex: number): Promise<PlannedDay> {
  const week = weekFor(brief);
  const d = Math.max(0, Math.min(week.length - 1, Math.round(dayIndex)));
  const closings = closingsFor({ week, dayIndex: d, site: brief.site, brand: brief.brand, seed: brief.seed });
  const dayAngles = anglesFor({ week, dayIndex: d, angles: brief.angles });
  const prompt = buildDayPrompt({
    summary: brief.summary,
    voice: brief.voice,
    brand: brief.brand,
    site: brief.site,
    day: week[d],
    posts: week[d].posts.map((post, i) => ({ format: post.format, angle: dayAngles[i], closing: closings[i] })),
  });
  const reply = await ask(prompt.system, prompt.user, Date.now() + 40_000, 2000);
  const written: (ReturnType<typeof normalizeDay> | null)[] = week.map(() => null);
  if (reply) {
    const day = normalizeDay(reply, closings.map((closing, i) => ({ closing, format: week[d].posts[i].format })));
    if (day.some(Boolean)) written[d] = day;
  }
  return assembleWeek({ week, angles: brief.angles, written, site: brief.site, brand: brief.brand, seed: brief.seed })[d];
}

// ---- The whole week in one call (kept for API callers) ----

export async function makeDistributePlan(input: DistributeInput): Promise<DistributeResult> {
  const made = await makeBrief(input);
  if (!made.ok) return made;
  const { brief } = made;
  const days: PlannedDay[] = [];
  const queue = [0, 1, 2, 3, 4, 5, 6];
  const worker = async () => {
    for (let d = queue.shift(); d !== undefined; d = queue.shift()) days[d] = await writeDay(brief, d);
  };
  await Promise.all([worker(), worker(), worker()]);
  const plainDays = days.filter((day) => day.posts.some((post) => post.fallback)).length;
  return { ok: true, plan: { start: brief.start, perDay: brief.perDay, summary: brief.summary, voice: brief.voice, site: brief.site, source: brief.source, days, plainDays } };
}
