'use strict';

// The single-image makers (ads, quotes, tips, announcements, polls). This is the only place the shapes are
// decided: the chat card, the message in the thread, the weekly calendar and the server all read through it.
// The model only proposes words; everything is clamped here, and the drawing code spells them itself.

const KINDS = {
  ad: { label: 'Ad', hint: 'A headline, a line and a button', brief: 'An advertising image. A scroll-stopping headline that names the desire or the problem, one supporting line, a short action on the button. Sell the benefit without hype. Never invent discounts, scarcity, numbers, awards or testimonials.', placeholder: 'What are you advertising, and to whom?' },
  quote: { label: 'Quote', hint: 'One line worth sharing', brief: 'A shareable quote card. One original line (never attributed to a real person and never a famous quote): wise, specific, and short enough to read in three seconds. The headline IS the quote.', placeholder: 'What should the quote be about?' },
  tip: { label: 'Tip', hint: 'One useful idea, taught fast', brief: 'A one-idea teaching card. The headline states the tip as an instruction. The sub line gives the reason or a concrete example in one or two plain sentences. No numbers or statistics unless the person gave them.', placeholder: 'What is the tip about?' },
  announcement: { label: 'Announcement', hint: 'News, a launch, an update', brief: 'An announcement image. The kicker names the kind of news (NEW, UPDATE, LAUNCH). The headline says what changed in plain words, the sub line says who it helps. Use only facts the person gave.', placeholder: 'What are you announcing?' },
  question: { label: 'Poll', hint: 'A question people vote on', brief: 'A poll image to start a conversation. The headline is one clear question. Give 2 to 4 short answer options that are genuinely different, each at most 4 words. Friendly and easy to answer in a comment.', placeholder: 'What do you want to ask people?' },
};

const KIND_IDS = Object.keys(KINDS);

// Sizes people post: square for feeds, 4:5 for the biggest feed shape, 9:16 for stories and reels covers,
// and the wide 1.91:1 that link and ad previews use.
const FORMATS = {
  square: { label: 'Square', note: '1:1', w: 1080, h: 1080 },
  portrait: { label: 'Portrait', note: '4:5', w: 1080, h: 1350 },
  story: { label: 'Story', note: '9:16', w: 1080, h: 1920 },
  wide: { label: 'Wide', note: '1.91:1', w: 1200, h: 628 },
};
const FORMAT_IDS = Object.keys(FORMATS);

const THEMES = ['forge', 'crystal', 'mono', 'violet', 'emerald', 'rose', 'sunrise', 'paper'];
const COVER_STYLES = ['photo', 'cinematic', 'render', 'surreal', 'drawn'];

const LIMITS = { kicker: 18, headline: 120, sub: 180, button: 28, option: 34, attribution: 40, scene: 240, topic: 500 };

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Keeps the *accent* markers but fixes unbalanced asterisks.
function accentText(value, max) {
  let text = clean(value, max + 8).replace(/\*{2,}/g, '*');
  if ((text.match(/\*/g) || []).length % 2 === 1) text = text.replace(/\*/g, '');
  // Punctuation right after a highlighted word stays with it, so it is not drawn as a lone word.
  text = text.replace(/\*([^*]+)\*([,.!?;:]+)/g, '*$1$2*');
  return text.slice(0, max + 8);
}

function kindOf(value) {
  return Object.prototype.hasOwnProperty.call(KINDS, value) ? value : 'ad';
}

function formatOf(value) {
  return Object.prototype.hasOwnProperty.call(FORMATS, value) ? value : 'square';
}

const SYSTEM = `You write the words for one social media image (an ad, quote, tip, announcement or poll). The words are drawn onto the picture by the app, so they must be short. You output ONLY one JSON object, no prose and no code fences.

Shape:
{"kicker":"...","headline":"...","sub":"...","button":"...","options":["...","..."],"scene":"..."}

Rules:
- headline: at most 9 words, plain and specific. Wrap the 1 to 3 most important words in asterisks, like: STOP POSTING *WITHOUT* A HOOK.
- kicker: a tiny label of at most 3 words (for example NEW, QUICK TIP, POLL). Empty string if it adds nothing.
- sub: at most 22 words. Empty string for quotes and polls.
- button: a short action of at most 3 words for ads and announcements ("Try it free"). Empty string for the other kinds.
- options: only for polls, 2 to 4 answers of at most 4 words each. An empty array for every other kind.
- scene: ONE sentence, at most 28 words, describing a single striking photographable scene or visual metaphor for the topic (concrete objects, setting, light). No text, no logos, no brand names, no real people's names.
- Use ONLY facts that appear in the person's text. Never invent numbers, prices, statistics, awards, quotes from real people or results. If the material is thin, make fewer, safer claims.
- Never mention a brand, website or handle the person did not give you.
- Write in the same language as the person's input. Honest and specific, never generic filler, no emoji.`;

/** -> { system, user, kind } */
function buildImagePrompt({ kind, topic, button }) {
  const k = kindOf(kind);
  const lines = [`Image kind: ${KINDS[k].label}. ${KINDS[k].brief}`, 'The person describes what it is about:', clean(topic, LIMITS.topic)];
  const own = clean(button, LIMITS.button);
  if (own && (k === 'ad' || k === 'announcement')) lines.push(`The button must say exactly: ${own}`);
  return { system: SYSTEM, user: lines.join('\n'), kind: k };
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

/** Reads the model's reply for a kind. -> { ok: true, copy } | { ok: false, error } */
function normalizeImageCopy(raw, kind, { button = '' } = {}) {
  const k = kindOf(kind);
  const data = typeof raw === 'string' ? extractJson(raw) : raw;
  if (!data || typeof data !== 'object') return { ok: false, error: 'The words came back unreadable.' };
  const headline = accentText(data.headline, LIMITS.headline);
  if (headline.replace(/\*/g, '').length < 4) return { ok: false, error: 'The words had no headline.' };
  const own = clean(button, LIMITS.button);
  const options = (Array.isArray(data.options) ? data.options : []).map((option) => clean(option, LIMITS.option)).filter(Boolean).slice(0, 4);
  if (k === 'question' && options.length < 2) return { ok: false, error: 'The poll had too few answers.' };
  const wantsButton = k === 'ad' || k === 'announcement';
  return {
    ok: true,
    copy: {
      kicker: clean(data.kicker, LIMITS.kicker),
      headline,
      sub: k === 'quote' || k === 'question' ? '' : clean(data.sub, LIMITS.sub),
      button: wantsButton ? own || clean(data.button, LIMITS.button) || 'Learn more' : '',
      options: k === 'question' ? options : [],
      attribution: '',
      scene: clean(data.scene, LIMITS.scene),
    },
  };
}

function sanitizeCopy(input) {
  const copy = input && typeof input === 'object' ? input : {};
  return {
    kicker: clean(copy.kicker, LIMITS.kicker),
    headline: accentText(copy.headline, LIMITS.headline),
    sub: clean(copy.sub, LIMITS.sub),
    button: clean(copy.button, LIMITS.button),
    options: (Array.isArray(copy.options) ? copy.options : []).map((option) => clean(option, LIMITS.option)).filter(Boolean).slice(0, 4),
    attribution: clean(copy.attribution, LIMITS.attribution),
    scene: clean(copy.scene, LIMITS.scene),
  };
}

/** The clean fields of an image that lives in the chat as a message, or null when it is not usable. */
function sanitizeImage(input) {
  if (!input || typeof input !== 'object') return null;
  const kind = Object.prototype.hasOwnProperty.call(KINDS, input.kind) ? input.kind : null;
  if (!kind) return null;
  const copy = sanitizeCopy(input.copy);
  if (copy.headline.replace(/\*/g, '').length < 3) return null;
  if (kind === 'question' && copy.options.length < 2) return null;
  const brand = input.brand && typeof input.brand === 'object' ? input.brand : {};
  const coverUrl = typeof input.coverUrl === 'string' && /^https:\/\/[^\s]+$/.test(input.coverUrl) ? input.coverUrl.slice(0, 600) : '';
  return {
    kind,
    format: formatOf(input.format),
    copy,
    theme: THEMES.includes(input.theme) ? input.theme : 'forge',
    coverStyle: COVER_STYLES.includes(input.coverStyle) ? input.coverStyle : 'photo',
    brand: { name: clean(brand.name, 60), handle: clean(brand.handle, 60), accent: clean(brand.accent, 12) },
    topic: clean(input.topic, LIMITS.topic),
    ...(coverUrl ? { coverUrl } : {}),
  };
}

// A short caption to post under the picture (the calendar and the "copy caption" button use it).
function imageCaption(image, closing = '') {
  const copy = image.copy;
  const head = copy.headline.replace(/\*/g, '');
  const parts = [];
  if (image.kind === 'question') parts.push(head, copy.options.map((option, i) => `${String.fromCharCode(65 + i)}) ${option}`).join('\n'), 'Tell us in the comments.');
  else if (image.kind === 'quote') parts.push(`"${head}"`);
  else parts.push(head, copy.sub);
  if (closing) parts.push(closing);
  return parts.filter(Boolean).join('\n\n');
}

module.exports = { KINDS, KIND_IDS, FORMATS, FORMAT_IDS, THEMES, COVER_STYLES, LIMITS, kindOf, formatOf, buildImagePrompt, normalizeImageCopy, sanitizeCopy, sanitizeImage, imageCaption, extractJson };
