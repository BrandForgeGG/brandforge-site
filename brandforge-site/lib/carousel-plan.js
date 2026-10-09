'use strict';

// Plans a "numbered list" carousel from a person's words, a web page or a file's text. The model
// only proposes the words; this module builds the prompt, reads the reply defensively and clamps
// every field to what fits on a slide. Pure, so node:test can drive it without a model.

const LIMITS = { topic: 1500, source: 12000, items: 10, minItems: 3, name: 28, bullet: 90, headline: 70, subtitle: 40, cta: 70, note: 60, button: 40 };

const PLAN_SYSTEM = `You write the words for a social media carousel (Instagram, TikTok, LinkedIn): a hook cover, one slide per item, and a closing call to action. You output ONLY one JSON object, no prose and no code fences.

Shape:
{"cover":{"headline":"...","subtitle":"..."},"items":[{"name":"...","bullets":["...","...","..."]}],"cta":{"headline":"...","button":"...","note":"..."}}

Rules:
- cover.headline: a scroll-stopping hook of at most 8 words. Wrap the 1 to 3 most important words in asterisks, like: THESE TOOLS ARE *SHAKING* THE WORLD. cover.subtitle: at most 5 words, for example "7 tools worth knowing".
- items: the requested number. name is at most 3 words and names the thing (a tool, step, idea or tip), no numbering. Exactly 3 bullets per item, each a short plain sentence of at most 14 words, concrete and useful, no emoji.
- Use ONLY facts that appear in the person's text or the page text provided. Never invent numbers, prices, statistics, awards, quotes or results. If the source is thin, make fewer, safer claims rather than inventing.
- cta: headline of at most 8 words (accent words in asterisks), button a short action, note a short reassurance. Do not claim anything you cannot back up.
- Write in the same language as the person's input. Keep it honest and specific, never generic filler.`;

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * @param {{ mode: 'words'|'url'|'file', topic?: string, sourceText?: string, sourceTitle?: string, count?: number }} input
 * @returns {{ system: string, user: string, count: number }}
 */
function buildPlanPrompt(input) {
  const count = Math.max(LIMITS.minItems, Math.min(LIMITS.items, Math.round(Number(input.count) || 7)));
  const topic = clean(input.topic, LIMITS.topic);
  const source = String(input.sourceText || '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.source);
  const lines = [`Number of items: ${count}.`];
  if (input.mode === 'words') {
    lines.push('The person describes what the carousel is about:', topic);
  } else {
    if (topic) lines.push('What the person wants from it:', topic);
    lines.push(input.mode === 'url' ? `Page title: ${clean(input.sourceTitle, 200)}` : `File name: ${clean(input.sourceTitle, 120)}`, 'Source text (the only facts you may use):', source);
  }
  return { system: PLAN_SYSTEM, user: lines.join('\n'), count };
}

function extractJson(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Keeps the *accent* markers but caps the visible length and fixes unbalanced asterisks.
function accentText(value, max) {
  let text = clean(value, max + 8).replace(/\*{2,}/g, '*');
  if ((text.match(/\*/g) || []).length % 2 === 1) text = text.replace(/\*/g, '');
  return text.slice(0, max + 8);
}

/** @returns {{ ok: true, plan: object } | { ok: false, error: string }} */
function normalizePlan(raw, { count = 7 } = {}) {
  const data = typeof raw === 'string' ? extractJson(raw) : raw;
  if (!data || typeof data !== 'object') return { ok: false, error: 'The plan came back unreadable.' };
  const cover = data.cover && typeof data.cover === 'object' ? data.cover : {};
  const headline = accentText(cover.headline, LIMITS.headline);
  if (headline.replace(/\*/g, '').length < 4) return { ok: false, error: 'The plan had no headline.' };

  const items = (Array.isArray(data.items) ? data.items : [])
    .map((item) => {
      const bullets = (Array.isArray(item && item.bullets) ? item.bullets : []).map((b) => clean(b, LIMITS.bullet)).filter(Boolean).slice(0, 3);
      return { name: clean(item && item.name, LIMITS.name), bullets };
    })
    .filter((item) => item.name && item.bullets.length >= 1)
    .slice(0, Math.min(LIMITS.items, Math.max(LIMITS.minItems, count)));
  if (items.length < LIMITS.minItems) return { ok: false, error: 'The plan had too few items.' };

  const cta = data.cta && typeof data.cta === 'object' ? data.cta : {};
  return {
    ok: true,
    plan: {
      cover: { headline, subtitle: clean(cover.subtitle, LIMITS.subtitle) || `${items.length} things to know` },
      items: items.map((item, i) => ({ n: i + 1, name: item.name, bullets: item.bullets })),
      cta: {
        headline: accentText(cta.headline, LIMITS.cta) || 'WANT MORE? *FOLLOW* FOR THE NEXT ONE',
        button: clean(cta.button, LIMITS.button) || 'Follow for more',
        note: clean(cta.note, LIMITS.note),
      },
    },
  };
}

module.exports = { LIMITS, PLAN_SYSTEM, buildPlanPrompt, extractJson, normalizePlan };
