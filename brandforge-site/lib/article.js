'use strict';

// Article: a long-form piece (a blog post, a LinkedIn article, a newsletter) written from a topic. The pure part: the prompt
// and the careful reading of what the model sends back, plus the two forms people take away (Markdown and plain text).

const LIMITS = { topic: 1500, title: 110, dek: 220, heading: 90, paragraph: 900, sections: 7, paragraphs: 4, closing: 400 };

const SYSTEM = `You write one article for a business or creator: a blog post, a LinkedIn article or a newsletter. You output ONLY one JSON object, no prose and no code fences.

Shape:
{"title":"...","dek":"...","sections":[{"heading":"...","paragraphs":["...","..."]}],"closing":"..."}

Rules:
- title: at most 12 words, specific and honest, no clickbait.
- dek: one or two sentences under the title that say what the reader gets.
- sections: 3 to 6 sections. Each heading at most 9 words. Each section has 1 to 3 paragraphs of 2 to 5 sentences.
- closing: one short paragraph that wraps up and invites one action.
- Use ONLY facts in the person's text. Never invent numbers, prices, statistics, studies, quotes, names of people or results. If the material is thin, write practical, general advice and make fewer claims.
- Never mention a brand, website or handle the person did not give you.
- Plain, warm, direct sentences. No emoji, no hashtags, no filler like "In today's fast-paced world".
- Write in the same language as the person's input.`;

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

function buildArticlePrompt({ topic, audience, length }) {
  const lines = ['The person wants an article about:', clean(topic, LIMITS.topic)];
  const who = clean(audience, 120);
  if (who) lines.push(`It is for: ${who}`);
  lines.push(length === 'short' ? 'Keep it short: 3 sections, one paragraph each.' : length === 'long' ? 'Make it thorough: 5 or 6 sections.' : 'A normal length: 4 sections.');
  return { system: SYSTEM, user: lines.join('\n') };
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

/** -> { ok: true, article } | { ok: false, error } */
function normalizeArticle(raw) {
  const data = typeof raw === 'string' ? extractJson(raw) : raw;
  if (!data || typeof data !== 'object') return { ok: false, error: 'The article came back unreadable.' };
  const title = clean(data.title, LIMITS.title);
  if (title.length < 4) return { ok: false, error: 'The article had no title.' };
  const sections = (Array.isArray(data.sections) ? data.sections : [])
    .map((section) => ({
      heading: clean(section && section.heading, LIMITS.heading),
      paragraphs: (Array.isArray(section && section.paragraphs) ? section.paragraphs : []).map((paragraph) => clean(paragraph, LIMITS.paragraph)).filter((paragraph) => paragraph.length > 20).slice(0, LIMITS.paragraphs),
    }))
    .filter((section) => section.heading && section.paragraphs.length > 0)
    .slice(0, LIMITS.sections);
  if (sections.length < 2) return { ok: false, error: 'The article was too thin.' };
  return { ok: true, article: { title, dek: clean(data.dek, LIMITS.dek), sections, closing: clean(data.closing, LIMITS.closing) } };
}

function articleMarkdown(article) {
  const parts = [`# ${article.title}`];
  if (article.dek) parts.push(`_${article.dek}_`);
  for (const section of article.sections) parts.push(`## ${section.heading}`, ...section.paragraphs);
  if (article.closing) parts.push(article.closing);
  return `${parts.join('\n\n')}\n`;
}

function articleText(article) {
  const parts = [article.title];
  if (article.dek) parts.push(article.dek);
  for (const section of article.sections) parts.push(section.heading, ...section.paragraphs);
  if (article.closing) parts.push(article.closing);
  return parts.join('\n\n');
}

function wordCount(article) {
  return articleText(article).split(/\s+/).filter(Boolean).length;
}

module.exports = { LIMITS, SYSTEM, buildArticlePrompt, normalizeArticle, articleMarkdown, articleText, wordCount };
