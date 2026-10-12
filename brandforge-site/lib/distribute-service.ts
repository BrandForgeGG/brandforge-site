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
  normalizeAngles,
  normalizeDay,
  perDayOf,
  startOf,
  type PlannedDay,
} from '@/lib/distribute-plan.js';

// Writes a person's week of posts from a sentence, a link or a file. Two kinds of calls: one to decide what to say all
// week (the angles), then one per day, in parallel, to write that day's topics and captions. A day the writer cannot
// finish still gets plain posts built from its angles, so the week is never empty, and the result says so.
export type DistributeInput = { text?: string; url?: string; fileText?: string; fileName?: string; perDay?: number; startDate?: string; brand?: string };
export type DistributePlan = { start: string; perDay: number; summary: string; voice: string; site: string; source: 'text' | 'link' | 'file'; days: PlannedDay[]; plainDays: number };
export type DistributeResult = { ok: true; plan: DistributePlan } | { ok: false; status: number; error: string };

const MODELS = writerChain();
const DEADLINE_MS = 52_000;

async function ask(system: string, user: string, until: number, maxTokens: number): Promise<string | null> {
  const apiKey = String(process.env.OPENROUTER_API_KEY ?? '').trim();
  for (const model of MODELS) {
    const left = until - Date.now();
    if (left < 4000) return null;
    const free = model.endsWith(':free');
    try {
      const completion = await completeJson({ apiKey, model, system, user, temperature: 0.7, maxTokens: free ? maxTokens * 3 : maxTokens, timeoutMs: Math.min(free ? 45_000 : 24_000, left) });
      return completion.text;
    } catch (cause) {
      console.warn('distribute model failed:', model, cause instanceof Error ? cause.message.slice(0, 120) : cause);
    }
  }
  return null;
}

export async function makeDistributePlan(input: DistributeInput): Promise<DistributeResult> {
  if (!String(process.env.OPENROUTER_API_KEY ?? '').trim()) return { ok: false, status: 503, error: 'The writer is not available right now.' };
  const started = Date.now();
  const until = started + DEADLINE_MS;

  const typed = String(input.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 2500);
  const fileText = String(input.fileText ?? '').trim().slice(0, 6000);
  const link = String(input.url ?? '').trim() || extractUrls(typed, 1)[0] || '';

  const parts: string[] = [];
  let source: DistributePlan['source'] = 'text';
  let site = '';
  if (typed) parts.push(`In their own words: ${typed}`);
  if (fileText) {
    parts.push(`From the file "${String(input.fileName ?? 'file').slice(0, 80)}":\n${fileText}`);
    source = 'file';
  }
  if (link) {
    try {
      const page = await fetchPage(link, { timeoutMs: 8000, maxChars: 5000 });
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
  // Without a site of their own there is nobody to send to, so the posts ask for follows, saves, comments and messages.
  const allow = site ? undefined : ['follow', 'save', 'like', 'comment', 'share', 'dm'];
  const week = layoutWeek({ startDate: start, perDay, seed: site || typed.slice(0, 30), allow });
  const seed = `${start}:${site || 'x'}`;

  // 1. What to say all week.
  const total = perDay * 7;
  const anglesPrompt = buildAnglesPrompt({ source: sourceText, count: total, site });
  let planned: ReturnType<typeof normalizeAngles> = { ok: false, error: 'The plan came back unreadable.' };
  for (let attempt = 0; attempt < 2 && !planned.ok; attempt++) {
    const reply = await ask(anglesPrompt.system, anglesPrompt.user, until, 1400);
    if (reply) planned = normalizeAngles(reply, total);
  }
  if (!planned.ok) return { ok: false, status: 502, error: 'The writer is busy. Try again in a moment, or give it a little more to work with.' };

  // 2. One call per day, a few at a time so a free provider is not flooded.
  const written: (ReturnType<typeof normalizeDay> | null)[] = week.map(() => null);
  const queue: number[] = week.map((_, d) => d);
  const worker = async () => {
    for (let d = queue.shift(); d !== undefined; d = queue.shift()) {
      const closings = closingsFor({ week, dayIndex: d, site, brand, seed });
      const dayAngles = anglesFor({ week, dayIndex: d, angles: planned.ok ? planned.angles : [] });
      const prompt = buildDayPrompt({
        summary: planned.ok ? planned.summary : '',
        voice: planned.ok ? planned.voice : '',
        brand,
        site,
        day: week[d],
        posts: week[d].posts.map((post, i) => ({ format: post.format, angle: dayAngles[i], closing: closings[i] })),
      });
      const reply = await ask(prompt.system, prompt.user, until, 2000);
      if (!reply) continue;
      const day = normalizeDay(reply, closings.map((closing, i) => ({ closing, format: week[d].posts[i].format })));
      if (day.some(Boolean)) written[d] = day;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  // A day the writer could not finish (a busy provider) gets one more try while there is time left.
  const unfinished = () => week.map((_, d) => d).filter((d) => !written[d] || written[d]!.some((post) => !post || !post.visual));
  if (until - Date.now() > 9000) {
    queue.push(...unfinished());
    await Promise.all([worker(), worker()]);
  }

  const days = assembleWeek({ week, angles: planned.angles, written, site, brand, seed });
  const plainDays = days.filter((day) => day.posts.some((post) => post.fallback)).length;
  return { ok: true, plan: { start, perDay, summary: planned.summary, voice: planned.voice, site, source, days, plainDays } };
}
