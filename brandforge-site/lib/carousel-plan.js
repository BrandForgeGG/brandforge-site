'use strict';

// Plans a carousel from a person's words, a web page or a file's text. The model only proposes the
// words; this module builds the prompt, reads the reply defensively and clamps every field to what
// fits on a slide. Pure, so node:test can drive it without a model.

const LIMITS = { topic: 1500, source: 12000, items: 10, minItems: 3, name: 28, bullet: 90, headline: 70, subtitle: 40, cta: 70, note: 60, button: 40, ctaInput: 80 };

// The kind of post. Each adds a short brief to the prompt: what the cover promises and how the items
// are shaped. News is the only type that needs a real source, because a model cannot know today's news.
const TYPES = {
  list: { label: 'Top list', needsSource: false, brief: 'A numbered list post: the cover promises the number and the payoff, each item is one distinct thing worth knowing.' },
  educational: { label: 'Educational', needsSource: false, brief: 'Teach one idea step by step. The cover promises what the reader will be able to do. Each item is one clear step or lesson, in order, with a concrete example or action.' },
  news: { label: 'News and trends', needsSource: true, brief: 'Explain what is happening and why it matters. Items cover: what happened, why it matters, who it affects, what to do next. Use ONLY the source text for facts and dates. Never claim something is new or trending unless the source says so.' },
  promo: { label: 'Promotional', needsSource: false, brief: 'Sell without sounding like an ad. The cover names the problem or desire. Items are benefits shown through concrete situations. Include proof only if the person supplied it. Never invent testimonials, discounts, scarcity or numbers.' },
  funny: { label: 'Funny', needsSource: false, brief: 'Light, relatable humour about the topic. Short punchy lines, a running joke or pattern across items, a punchline on the last item. Keep it kind: no insults, no jokes about protected groups, nothing about real people.' },
  story: { label: 'Story', needsSource: false, brief: 'Tell it as a story arc over the slides: the situation, the problem, the turning point, what changed, the lesson. Use only events the person described.' },
  explainer: { label: 'Why, how, what, who', needsSource: false, brief: 'Answer the questions a newcomer asks, one per item: What is it? Why does it matter? How does it work? Who is it for? What should I do first?' },
};

const PLAN_SYSTEM = `You write the words for a social media carousel (Instagram, TikTok, LinkedIn): a hook cover, one slide per item, and a closing call to action. You output ONLY one JSON object, no prose and no code fences.

Shape:
{"cover":{"headline":"...","subtitle":"...","scene":"..."},"items":[{"name":"...","bullets":["...","...","..."]}],"cta":{"headline":"...","button":"...","note":"..."}}

Rules:
- cover.headline: a scroll-stopping hook of at most 8 words. Wrap the 1 to 3 most important words in asterisks, like: THESE TOOLS ARE *SHAKING* THE WORLD. cover.subtitle: at most 5 words, for example "7 tools worth knowing".
- cover.scene: ONE sentence, at most 28 words, describing a single striking photographable scene or visual metaphor for the topic (concrete objects, setting, light). No text, no logos, no brand names, no real people's names. Smart, not a cliche stock photo.
- items: the requested number. name is at most 3 words and names the thing (a tool, step, idea or tip), no numbering. Exactly 3 bullets per item, each a short plain sentence of at most 14 words, concrete and useful, no emoji.
- Use ONLY facts that appear in the person's text or the source text provided. Never invent numbers, prices, statistics, awards, quotes or results. If the material is thin, make fewer, safer claims rather than inventing.
- cta: headline of at most 8 words (accent words in asterisks), button a short action, note a short reassurance. Never mention any brand, website or handle that the person did not give you.
- Write in the same language as the person's input. Keep it honest and specific, never generic filler.`;

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function typeOf(value) {
  return Object.prototype.hasOwnProperty.call(TYPES, value) ? value : 'list';
}

/**
 * @param {{ mode: 'words'|'url'|'file', type?: string, topic?: string, sourceText?: string, sourceTitle?: string, count?: number, cta?: string }} input
 * @returns {{ system: string, user: string, count: number, type: string }}
 */
function buildPlanPrompt(input) {
  const count = Math.max(LIMITS.minItems, Math.min(LIMITS.items, Math.round(Number(input.count) || 7)));
  const type = typeOf(input.type);
  const topic = clean(input.topic, LIMITS.topic);
  const source = String(input.sourceText || '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.source);
  const lines = [`Number of items: ${count}.`, `Post type: ${TYPES[type].label}. ${TYPES[type].brief}`];
  if (input.mode === 'words' && !source) {
    lines.push('The person describes what the carousel is about:', topic);
  } else {
    if (topic) lines.push('What the person wants from it:', topic);
    const label = input.mode === 'url' ? `Page title: ${clean(input.sourceTitle, 200)}` : input.mode === 'file' ? `File name: ${clean(input.sourceTitle, 120)}` : `Sources found on the web: ${clean(input.sourceTitle, 300)}`;
    lines.push(label, 'Source text (the only facts you may use):', source);
  }
  const cta = clean(input.cta, LIMITS.ctaInput);
  if (cta) lines.push(`The closing call to action must be about this, in the person's own words: ${cta}`);
  return { system: PLAN_SYSTEM, user: lines.join('\n'), count, type };
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

/**
 * `cta` (optional) is the person's own closing line. When given it becomes the button text exactly, so
 * the model can never put words in their mouth.
 * @returns {{ ok: true, plan: object } | { ok: false, error: string }}
 */
function normalizePlan(raw, { count = 7, cta: ctaInput = '' } = {}) {
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
  const own = clean(ctaInput, LIMITS.ctaInput);
  return {
    ok: true,
    plan: {
      cover: { headline, subtitle: clean(cover.subtitle, LIMITS.subtitle) || `${items.length} things to know`, scene: clean(cover.scene, 240) },
      items: items.map((item, i) => ({ n: i + 1, name: item.name, bullets: item.bullets })),
      cta: {
        headline: accentText(cta.headline, LIMITS.cta) || 'WANT MORE? *FOLLOW* FOR THE NEXT ONE',
        button: own ? clean(own, LIMITS.button) : clean(cta.button, LIMITS.button) || 'Follow for more',
        note: own ? '' : clean(cta.note, LIMITS.note),
      },
    },
  };
}

module.exports = { LIMITS, TYPES, PLAN_SYSTEM, buildPlanPrompt, extractJson, normalizePlan };
