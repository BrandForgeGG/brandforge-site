'use strict';

// Distribute: from a sentence, a link or a file to a week of posts. This module is the pure part: it lays the week
// out (which days, which times, which format, which kind of ask), builds the prompts for the writer, and reads the
// replies defensively. The model only proposes angles, topics and captions; the schedule, the formats and the asks are
// decided here, so a week is always full, varied and never two of the same in a row.
const { ctaPlan, ctaLine } = require('./caption-cta');
const { normalizeImageCopy } = require('./image-kinds');
const { normalizePlan } = require('./carousel-plan');

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_FOCUS = ['Start the week', 'Teach something', 'Show how it works', 'Answer a question', 'Make it personal', 'Keep it light', 'Look ahead'];

// Posting times by how many a day, drawn from five slots five hours apart: 2 AM, 7 AM, 12 PM, 5 PM and 10 PM. A short day
// keeps the busiest slots (the 2 AM slot is only used when posting five a day).
const SLOT_SETS = {
  1: ['12:00'],
  2: ['07:00', '17:00'],
  3: ['07:00', '12:00', '22:00'],
  4: ['07:00', '12:00', '17:00', '22:00'],
  5: ['02:00', '07:00', '12:00', '17:00', '22:00'],
};

// The six single-post formats, cycled so neighbouring posts never share one.
const FORMAT_CYCLE = ['quote', 'tip', 'carousel', 'ad', 'question', 'announcement'];

// The size each single-image format is posted at, and the looks the week rotates through so it never reads as one colour.
const IMAGE_SIZE = { ad: 'portrait', quote: 'square', tip: 'square', announcement: 'square', question: 'square' };
const LOOKS = ['forge', 'violet', 'paper', 'emerald', 'sunrise', 'crystal', 'rose', 'mono'];

// With no site of the person's own there is nowhere to send people, so the asks leave out "try the site" and "hire us".
const NO_SITE_ASKS = ['follow', 'save', 'like', 'comment', 'share', 'dm'];

const LIMITS = { source: 6000, angle: 110, topic: 150, caption: 480, summary: 420, voice: 160 };

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

function dayName(iso) {
  return DAY_NAMES[(new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7];
}

function perDayOf(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 3;
}

function startOf(value) {
  const text = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(new Date(`${text}T00:00:00Z`).getTime()) ? text : isoDate(Date.now() + 86400000);
}

/**
 * The empty week: seven days, each with its posts (time, format, kind of ask) and nothing written yet.
 * @returns {{ date: string, name: string, focus: string, posts: { time: string, format: string, cta: string }[] }[]}
 */
function layoutWeek({ startDate, perDay, seed = 'week', allow } = {}) {
  const count = perDayOf(perDay);
  const start = startOf(startDate);
  const times = SLOT_SETS[count];
  const formats = [];
  for (let d = 0; d < 7; d++) for (let i = 0; i < count; i++) formats.push(FORMAT_CYCLE[(d * count + i) % FORMAT_CYCLE.length]);
  const asks = ctaPlan(formats, `${seed}:${start}`, allow);
  return Array.from({ length: 7 }, (_, d) => {
    const date = addDays(start, d);
    return {
      date,
      name: dayName(date),
      focus: DAY_FOCUS[d % DAY_FOCUS.length],
      posts: times.map((time, i) => ({ time, format: formats[d * count + i], cta: asks[d * count + i] })),
    };
  });
}

// ---- Stage 1: what to say all week ----

const ANGLES_SYSTEM = `You plan a week of social media posts for a business or idea. You read what the person gave you (their own words, a web page or a file) and return ONLY one JSON object, no prose and no code fences:
{"summary":"...","voice":"...","angles":["...","..."]}

Rules:
- summary: one or two plain sentences saying what this is and who it is for, using only what the source says.
- voice: at most 12 words describing how the posts should sound (for example "warm, practical, a little playful").
- angles: the requested number of DISTINCT things to post about, each at most 14 words. Mix kinds: teach something, answer a common question, show how it works, a myth or mistake, a short story or reason it exists, what to do first, a question for the audience, what is on offer. Each angle must come from the source; never invent facts, numbers, customers, results, prices, awards or testimonials.
- Never repeat an angle, and never write two that make the same point.
- Write in the same language as the source.`;

function buildAnglesPrompt({ source, count, site = '' }) {
  const lines = [`Number of angles: ${Math.max(3, Math.min(40, Math.round(Number(count) || 21)))}.`];
  if (site) lines.push(`The address people should be sent to: ${clean(site, 120)}`);
  lines.push('Source:', clean(source, LIMITS.source));
  return { system: ANGLES_SYSTEM, user: lines.join('\n') };
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

const GENERIC_ANGLES = [
  'What this is and who it is for',
  'The problem it solves, in plain words',
  'How it works in three steps',
  'The most common mistake people make here',
  'What to do first if you are starting today',
  'A question for your audience about their biggest hurdle',
  'The reason this exists',
  'One thing people get wrong about it',
  'What you can get from it this week',
  'A quick tip you can use right now',
];

/** -> { ok: true, summary, voice, angles } | { ok: false, error }. Angles are padded to `count` so a week is never short. */
function normalizeAngles(raw, count) {
  const data = typeof raw === 'string' ? extractJson(raw) : raw;
  if (!data || typeof data !== 'object') return { ok: false, error: 'The plan came back unreadable.' };
  const summary = clean(data.summary, LIMITS.summary);
  if (summary.length < 10) return { ok: false, error: 'The plan had no summary.' };
  const seen = new Set();
  const angles = [];
  for (const item of Array.isArray(data.angles) ? data.angles : []) {
    const text = clean(item, LIMITS.angle);
    const key = text.toLowerCase();
    if (text.length >= 6 && !seen.has(key)) {
      seen.add(key);
      angles.push(text);
    }
  }
  if (angles.length < Math.ceil(count / 3)) return { ok: false, error: 'The plan had too few ideas.' };
  for (let i = 0; angles.length < count; i++) angles.push(GENERIC_ANGLES[i % GENERIC_ANGLES.length] + (i >= GENERIC_ANGLES.length ? ` (${Math.floor(i / GENERIC_ANGLES.length) + 1})` : ''));
  return { ok: true, summary, voice: clean(data.voice, LIMITS.voice), angles: angles.slice(0, count) };
}

// ---- Stage 2: one day's posts ----

const FORMAT_BRIEF = {
  quote: 'a quote card: the topic is the one idea the quote is about',
  tip: 'a tip card: the topic is the one tip, written as an instruction',
  carousel: 'a swipeable carousel: the topic is what the whole carousel teaches',
  ad: 'an ad image: the topic is what is being offered and to whom, using only the source',
  question: 'a poll image: the topic is the question people vote on',
  announcement: 'an announcement image: the topic is the news, using only the source',
};

const DAY_SYSTEM = `You write one day of social media posts. For each post you are given a format, an angle and the exact closing line to use. You return ONLY one JSON object, no prose and no code fences:
{"posts":[{"topic":"...","caption":"...","visual":{...}}]}

Rules:
- Exactly one entry per post, in the same order.
- topic: what the picture is about, at most 22 words, specific to the angle and the format. No invented facts.
- visual: the words that are drawn ON the picture, written for the format (see below). Short: they are printed large. Use only the summary and angle; never invent numbers, prices, customers or results.
- caption: at most 60 words, in the given voice, in the language of the source. Open with a line that earns the next one (a question, a surprising true point, a plain promise): vary the openings across posts. Then one or two short lines of substance. End with the closing line you were given, word for word. At most two hashtags, and none if they do not fit.
- Use ONLY facts from the summary and angle. Never invent numbers, prices, customers, results, awards, deadlines or scarcity. No emoji walls: at most one emoji.
- Posts on the same day must not sound alike.

VISUAL SHAPES (use the one for the post's format; wrap the 1 to 3 most important words of a headline in asterisks, like STOP POSTING *WITHOUT* A HOOK):
- quote: {"headline":"one original line, at most 14 words","kicker":"","sub":"","button":"","options":[]}
- tip: {"kicker":"QUICK TIP","headline":"the tip as an instruction, at most 9 words","sub":"the reason, at most 22 words","button":"","options":[]}
- ad: {"kicker":"at most 3 words","headline":"at most 9 words","sub":"at most 22 words","button":"at most 3 words","options":[]}
- announcement: {"kicker":"NEW","headline":"at most 9 words","sub":"at most 22 words","button":"at most 3 words","options":[]}
- question: {"kicker":"POLL","headline":"one clear question, at most 12 words","sub":"","button":"","options":["2 to 4 answers, at most 4 words each"]}
- carousel: {"headline":"scroll-stopping hook, at most 8 words","subtitle":"at most 5 words","items":[{"name":"at most 3 words","bullets":["at most 12 words","at most 12 words","at most 12 words"]}],"ctaHeadline":"at most 8 words","button":"at most 3 words"} with exactly 4 items.`;

function buildDayPrompt({ summary, voice, brand = '', site = '', day, posts }) {
  const lines = [`Business: ${clean(summary, LIMITS.summary)}`, `Voice: ${clean(voice, LIMITS.voice) || 'clear and friendly'}`];
  if (brand) lines.push(`Posting as: ${clean(brand, 60)}`);
  lines.push(`Day: ${day.name} (${day.focus}).`, 'Posts:');
  posts.forEach((post, index) => {
    lines.push(`${index + 1}. Format: ${FORMAT_BRIEF[post.format] || post.format}. Angle: ${clean(post.angle, LIMITS.angle)}. Closing line: ${post.closing}`);
  });
  void site;
  return { system: DAY_SYSTEM, user: lines.join('\n') };
}

// Makes sure the caption really ends with the closing line, so the ask is never lost.
function withClosing(caption, closing) {
  const body = clean(caption, LIMITS.caption);
  if (!closing) return body;
  const tail = closing.toLowerCase();
  if (body.toLowerCase().includes(tail)) return body;
  return `${body.replace(/[\s.]+$/, '')}.\n\n${closing}`.slice(0, LIMITS.caption + closing.length);
}

// The picture's words, checked for the format. -> { type: 'image', kind, format, copy } | { type: 'carousel', plan } | null
function readVisual(raw, format) {
  if (!raw || typeof raw !== 'object') return null;
  if (format === 'carousel') {
    const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 6);
    const checked = normalizePlan({ cover: { headline: raw.headline, subtitle: raw.subtitle, scene: '' }, items, cta: { headline: raw.ctaHeadline, button: raw.button, note: '' } }, { count: 4 });
    return checked.ok ? { type: 'carousel', plan: checked.plan } : null;
  }
  const kind = IMAGE_SIZE[format] ? format : null;
  if (!kind) return null;
  const checked = normalizeImageCopy(raw, kind);
  return checked.ok ? { type: 'image', kind, format: IMAGE_SIZE[kind], copy: checked.copy } : null;
}

/** One entry per expected post, null where the reply had nothing usable. */
function normalizeDay(raw, expected) {
  const data = typeof raw === 'string' ? extractJson(raw) : raw;
  const list = data && Array.isArray(data.posts) ? data.posts : [];
  return expected.map((post, index) => {
    const item = list[index];
    if (!item || typeof item !== 'object') return null;
    const topic = clean(item.topic, LIMITS.topic);
    const caption = clean(item.caption, LIMITS.caption);
    if (topic.length < 6 || caption.length < 20) return null;
    return { topic, caption: withClosing(caption, post.closing), visual: readVisual(item.visual, post.format) };
  });
}

const FALLBACK_OPENERS = {
  quote: (angle) => `One thought: ${angle}.`,
  tip: (angle) => `Quick tip: ${angle}.`,
  carousel: (angle) => `Swipe through: ${angle}.`,
  ad: (angle) => `${angle}.`,
  question: (angle) => `${angle}?`,
  announcement: (angle) => `News: ${angle}.`,
};

/** A plain post from the angle alone, used when the writer could not finish a day, so the week is never empty. */
function fallbackPost({ angle, format, closing }) {
  const open = (FALLBACK_OPENERS[format] || FALLBACK_OPENERS.tip)(clean(angle, LIMITS.angle).replace(/[.?!]+$/, ''));
  return { topic: clean(angle, LIMITS.topic), caption: `${open}\n\n${closing}`.slice(0, LIMITS.caption + 80), fallback: true };
}

const FALLBACK_BUTTON = { try: 'Try it free', hire: 'Hire us', dm: 'Message us', follow: 'Follow us', save: 'Learn more', like: 'Learn more', comment: 'Learn more', share: 'Learn more' };

// Words a headline must never end on ("…PUT THE PROMISE ON THE").
const DANGLING = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'your', 'our', 'their', 'its', 'is', 'are', 'that', 'this', 'not', 'because', 'when', 'if', 'so', 'as', 'than', 'into', 'about', 'what', 'who', 'which', 'while', 'without', 'each', 'every', 'de', 'la', 'el', 'y', 'en', 'un', 'una', 'le', 'les', 'et']);

/** A headline of at most `words` words: whole sentences when they fit, otherwise cut where it still reads as a phrase. */
function shortHeadline(text, words) {
  const all = clean(text, 160);
  const sentences = all.split(/(?<=[.?!])\s+/).filter(Boolean);
  let kept = '';
  for (const sentence of sentences) {
    const next = kept ? `${kept} ${sentence}` : sentence;
    if (next.split(' ').filter(Boolean).length > words) break;
    kept = next;
  }
  if (kept) return kept.replace(/[.?!]+$/, '');
  let parts = all.replace(/[.?!]+$/, '').split(' ').filter(Boolean).slice(0, words);
  // A clause ends at a comma: stop there when it leaves a real phrase.
  const clause = parts.slice(0, -1).map((word, i) => (/[,;:]$/.test(word) ? i : -1)).filter((i) => i >= 3).pop();
  if (clause !== undefined) parts = parts.slice(0, clause + 1);
  while (parts.length > 3 && DANGLING.has(parts[parts.length - 1].toLowerCase().replace(/[^\p{L}]/gu, ''))) parts.pop();
  return parts.join(' ').replace(/[,;:–-]+$/, '');
}

/**
 * A picture built from the post's own words when the writer gave none: the angle as the headline, on a tip, quote, ad,
 * announcement or poll. A carousel falls back to a tip card, since a carousel needs real slides to be worth showing.
 */
function fallbackVisual({ angle, topic, format, cta }) {
  const base = clean(angle || topic, LIMITS.angle);
  const headline = shortHeadline(base, format === 'quote' ? 14 : 9);
  const kind = IMAGE_SIZE[format] && format !== 'carousel' ? format : 'tip';
  const copy = { kicker: kind === 'tip' ? 'Quick tip' : kind === 'question' ? 'Poll' : kind === 'announcement' ? 'New' : '', headline, sub: kind === 'quote' || kind === 'question' ? '' : clean(topic && topic !== base ? topic : '', 160), button: kind === 'ad' || kind === 'announcement' ? FALLBACK_BUTTON[cta] || 'Learn more' : '', options: kind === 'question' ? ['Yes', 'No'] : [], attribution: '', scene: '' };
  return { type: 'image', kind, format: IMAGE_SIZE[kind], copy, fallback: true };
}

/**
 * Puts the week together: the layout, the angles and each day's written posts.
 * @param {{ week: ReturnType<typeof layoutWeek>, angles: string[], written: (({ topic: string, caption: string } | null)[] | null)[], site?: string, brand?: string, seed?: string }} input
 */
function assembleWeek({ week, angles, written, site = '', brand = '', seed = 'week' }) {
  let g = 0;
  return week.map((day, d) => ({
    date: day.date,
    name: day.name,
    focus: day.focus,
    posts: day.posts.map((post, i) => {
      const angle = angles[g % angles.length];
      const closing = ctaLine(post.cta, { seed: `${seed}:${g}`, site, brand });
      g += 1;
      const result = written && written[d] && written[d][i];
      const made = result || fallbackPost({ angle, format: post.format, closing });
      const visual = (result && result.visual) || fallbackVisual({ angle, topic: made.topic, format: post.format, cta: post.cta });
      return { id: `${day.date}-${i}`, time: post.time, format: post.format, cta: post.cta, angle, topic: made.topic, caption: made.caption, visual, theme: LOOKS[(d * week[0].posts.length + i) % LOOKS.length], ...(made.fallback ? { fallback: true } : {}) };
    }),
  }));
}

/** The closing lines for a day's posts, in order (the same ones assembleWeek uses). */
function closingsFor({ week, dayIndex, site = '', brand = '', seed = 'week' }) {
  const count = week[0].posts.length;
  return week[dayIndex].posts.map((post, i) => ctaLine(post.cta, { seed: `${seed}:${dayIndex * count + i}`, site, brand }));
}

/** The angle for each post of a day (angles are dealt out in order across the week). */
function anglesFor({ week, dayIndex, angles }) {
  const count = week[0].posts.length;
  return week[dayIndex].posts.map((_, i) => angles[(dayIndex * count + i) % angles.length]);
}

module.exports = { NO_SITE_ASKS, IMAGE_SIZE, LOOKS, fallbackVisual, readVisual, DAY_NAMES, DAY_FOCUS, SLOT_SETS, FORMAT_CYCLE, LIMITS, perDayOf, startOf, addDays, layoutWeek, buildAnglesPrompt, normalizeAngles, buildDayPrompt, normalizeDay, fallbackPost, assembleWeek, closingsFor, anglesFor, withClosing, extractJson };
