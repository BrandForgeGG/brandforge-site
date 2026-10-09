'use strict';

// Text-first post types beyond the carousel: an update, a poll, a quiz and a thread. Pure rules: what a
// post may contain, and how the same post is written for each platform. Sending lives in
// lib/post-publish.ts. Limits are the tightest of the platforms, so one post fits all of them.

const TYPES = {
  update: { label: 'Update', hint: 'A short post with bold, links and line breaks.' },
  poll: { label: 'Poll', hint: 'A question with two to ten answers people vote on.' },
  quiz: { label: 'Quiz', hint: 'A question with one right answer and a short explanation.' },
  thread: { label: 'Thread', hint: 'A story told over several linked posts.' },
};

const LIMITS = { update: 3000, question: 250, option: 55, explanation: 180, part: 280, minOptions: 2, maxOptions: 10, minParts: 2, maxParts: 12 };

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max);
}

function oneLine(value, max) {
  return clean(value, max).replace(/\s*\n\s*/g, ' ');
}

/** @returns {{ ok: true, post: object } | { ok: false, error: string }} */
function normalizePost(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const type = Object.prototype.hasOwnProperty.call(TYPES, data.type) ? data.type : null;
  if (!type) return { ok: false, error: 'Pick a post type: update, poll, quiz or thread.' };

  if (type === 'update') {
    const text = clean(data.text, LIMITS.update);
    if (text.length < 3) return { ok: false, error: 'Write the update first.' };
    return { ok: true, post: { type, text } };
  }

  if (type === 'poll' || type === 'quiz') {
    const question = oneLine(data.question, LIMITS.question);
    if (question.length < 5) return { ok: false, error: 'Write the question first.' };
    const options = (Array.isArray(data.options) ? data.options : []).map((o) => oneLine(o, LIMITS.option)).filter(Boolean);
    const unique = [...new Set(options.map((o) => o.toLowerCase()))];
    if (options.length < LIMITS.minOptions) return { ok: false, error: 'Give at least two answers.' };
    if (unique.length !== options.length) return { ok: false, error: 'Two answers are the same. Make each one different.' };
    if (options.length > LIMITS.maxOptions) return { ok: false, error: 'A poll can have up to ten answers.' };
    if (type === 'poll') return { ok: true, post: { type, question, options } };
    const correct = Number(data.correct);
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return { ok: false, error: 'Pick the right answer.' };
    return { ok: true, post: { type, question, options, correct, explanation: oneLine(data.explanation, LIMITS.explanation) } };
  }

  const parts = (Array.isArray(data.parts) ? data.parts : []).map((p) => clean(p, LIMITS.part)).filter(Boolean);
  if (parts.length < LIMITS.minParts) return { ok: false, error: 'A thread needs at least two posts.' };
  if (parts.length > LIMITS.maxParts) return { ok: false, error: 'A thread can have up to twelve posts.' };
  return { ok: true, post: { type, parts } };
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const URL_PATTERN = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g;

/** Telegram HTML: **bold**, _italic_, `code` and bare web addresses become real formatting and links. */
function telegramHtml(text) {
  let html = escapeHtml(text);
  html = html.replace(URL_PATTERN, (url) => `<a href="${url.replace(/"/g, '&quot;')}">${url}</a>`);
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1<i>$2</i>');
  return html;
}

/** Plain text with the asterisks gone, for platforms that do not format (Bluesky). */
function stripMarkup(text) {
  return String(text).replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/`([^`\n]+)`/g, '$1').replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1$2');
}

function graphemes(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].length;
  return [...text].length;
}

/** Link facets for Bluesky, with UTF-8 byte offsets, so web addresses are clickable. */
function linkFacets(text) {
  const facets = [];
  const encoder = new TextEncoder();
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = encoder.encode(text.slice(0, match.index)).length;
    const end = start + encoder.encode(match[0]).length;
    facets.push({ index: { byteStart: start, byteEnd: end }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: match[0] }] });
  }
  return facets;
}

const BSKY_MAX = 300;

function fitBluesky(text) {
  const plain = stripMarkup(text);
  if (graphemes(plain) <= BSKY_MAX) return plain;
  const chars = [...plain];
  let out = chars.slice(0, BSKY_MAX - 1).join('');
  while (graphemes(out) > BSKY_MAX - 1) out = out.slice(0, -1);
  return out.trimEnd() + '…';
}

function numbered(options) {
  return options.map((o, i) => `${i + 1}. ${o}`).join('\n');
}

/** The posts to send to Bluesky, in order: [{ text, facets }]. A thread is several, a quiz adds its answer last. */
function blueskyPosts(post) {
  const shaped = (text) => {
    const fitted = fitBluesky(text);
    return { text: fitted, facets: linkFacets(fitted) };
  };
  if (post.type === 'update') return [shaped(post.text)];
  if (post.type === 'thread') return post.parts.map((part, i) => shaped(`${part}\n\n${i + 1}/${post.parts.length}`));
  if (post.type === 'poll') return [shaped(`${post.question}\n\n${numbered(post.options)}\n\nReply with your number.`)];
  const answer = `Answer: ${post.correct + 1}. ${post.options[post.correct]}${post.explanation ? `\n\n${post.explanation}` : ''}`;
  return [shaped(`${post.question}\n\n${numbered(post.options)}\n\nReply with your guess. The answer is in the next post.`), shaped(answer)];
}

/** One Telegram message body (HTML) for update and thread posts. */
function telegramText(post) {
  if (post.type === 'thread') return telegramHtml(post.parts.map((part, i) => `**${i + 1}/${post.parts.length}** ${part}`).join('\n\n')).slice(0, 4000);
  return telegramHtml(post.text).slice(0, 4000);
}

/** The Discord embed for update and thread posts. */
function discordEmbed(post) {
  const body = post.type === 'thread' ? post.parts.map((part, i) => `**${i + 1}/${post.parts.length}** ${part}`).join('\n\n') : post.text;
  return { description: body.slice(0, 4000), color: 0xe8571e };
}

module.exports = { TYPES, LIMITS, normalizePost, telegramHtml, telegramText, stripMarkup, linkFacets, blueskyPosts, discordEmbed, graphemes, numbered };
