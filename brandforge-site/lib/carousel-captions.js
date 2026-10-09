'use strict';

// Captions for each platform a carousel can go to. The model writes them from the carousel's own
// words; this module builds the prompt, reads the reply and enforces each platform's limits so a
// caption can never be too long to post. Pure, so node:test can drive it.

const PLATFORMS = {
  instagram: { label: 'Instagram', limit: 2200, hashtags: '5 to 8', style: 'Warm and visual. A first line that stops the scroll, short lines, one clear action at the end.' },
  tiktok: { label: 'TikTok', limit: 2200, hashtags: '3 to 5', style: 'Casual, quick, punchy. Start with the hook. Ask a question to get comments.' },
  linkedin: { label: 'LinkedIn', limit: 3000, hashtags: '3', style: 'Professional but human. A strong opening line, short paragraphs, one takeaway, no emoji spam.' },
  x: { label: 'X', limit: 280, hashtags: '1 or 2', style: 'One tight thought that fits in 270 characters including hashtags and any link.' },
  facebook: { label: 'Facebook', limit: 600, hashtags: '0 to 2', style: 'Friendly and conversational, a short paragraph, a question that invites replies.' },
};

const SYSTEM = `You write social media captions for a carousel someone has already made. Output ONLY one JSON object with the keys instagram, tiktok, linkedin, x and facebook, each a string. No prose, no code fences.

Rules:
- Use ONLY what the carousel says. Never invent numbers, offers, results, quotes or claims.
- Never mention any brand, website or handle the person did not give you.
- If the person gave a call to action, end each caption with it, in their own words. If not, end with a simple invitation to save or follow.
- Match each platform's voice and obey its length limit and hashtag count (given below).
- Write in the same language as the carousel. No emoji walls: at most two emoji per caption.`;

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, '').trim().slice(0, max);
}

/** @param {{ plan: object, topic?: string, brandName?: string, handle?: string, cta?: string }} input */
function buildCaptionPrompt(input) {
  const plan = input.plan || {};
  const lines = [];
  lines.push(`Cover: ${clean(String(plan.cover && plan.cover.headline).replace(/\*/g, ''), 120)}`);
  for (const item of (plan.items || []).slice(0, 10)) {
    lines.push(`${item.n}. ${clean(item.name, 40)}: ${(item.bullets || []).map((b) => clean(b, 100)).filter(Boolean).join(' ')}`);
  }
  if (input.topic) lines.push(`What it is about: ${clean(input.topic, 300)}`);
  if (input.brandName) lines.push(`Posting as: ${clean(input.brandName, 40)}${input.handle ? ` (${clean(input.handle, 40)})` : ''}`);
  const cta = clean(input.cta || (plan.cta && plan.cta.button), 100);
  if (cta) lines.push(`Call to action to end with: ${cta}`);
  lines.push('', 'Platforms:');
  for (const [key, p] of Object.entries(PLATFORMS)) lines.push(`- ${key}: at most ${p.limit} characters, ${p.hashtags} hashtags. ${p.style}`);
  return { system: SYSTEM, user: lines.join('\n') };
}

function extractJson(raw) {
  if (typeof raw !== 'string') return null;
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

// Cuts a caption to the limit at a sentence or word boundary, never mid-word.
function fitCaption(text, limit) {
  const value = clean(text, limit + 400);
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
  if (sentence > limit * 0.6) return cut.slice(0, sentence + 1).trim();
  const space = cut.lastIndexOf(' ');
  return (space > limit * 0.6 ? cut.slice(0, space) : cut).trim();
}

/** @returns {{ ok: true, captions: Record<string,string> } | { ok: false, error: string }} */
function normalizeCaptions(raw) {
  const data = typeof raw === 'string' ? extractJson(raw) : raw;
  if (!data || typeof data !== 'object') return { ok: false, error: 'The captions came back unreadable.' };
  const captions = {};
  for (const [key, p] of Object.entries(PLATFORMS)) {
    const text = fitCaption(data[key], p.limit);
    if (text.length < 10) return { ok: false, error: `The ${p.label} caption was missing.` };
    captions[key] = text;
  }
  return { ok: true, captions };
}

// A plain caption built from the carousel itself, used when no model is available, so the Distribute
// step always has something real to show and copy.
function fallbackCaptions(plan, cta) {
  const hook = clean(String((plan && plan.cover && plan.cover.headline) || 'New carousel').replace(/\*/g, ''), 120);
  const points = ((plan && plan.items) || []).slice(0, 7).map((item) => `${item.n}. ${clean(item.name, 40)}`);
  const close = clean(cta || (plan && plan.cta && plan.cta.button) || 'Save this for later', 100);
  const long = `${hook}\n\n${points.join('\n')}\n\n${close}`;
  const out = {};
  for (const [key, p] of Object.entries(PLATFORMS)) out[key] = key === 'x' ? fitCaption(`${hook}. ${close}`, p.limit) : fitCaption(long, p.limit);
  return out;
}

module.exports = { PLATFORMS, SYSTEM, buildCaptionPrompt, normalizeCaptions, fallbackCaptions, fitCaption };
