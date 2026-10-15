'use strict';

// A video or an article that lives in its chat as a message. The chat is the draft: every version made lands in the
// thread, the newest one is reopened to edit, and publishing marks it rather than removing it. This is the only place
// their shape is decided: the server uses it to accept one and the transcript uses it to read one back.

const MAKERS = ['launch', 'short', 'long', 'square'];
const MAX_STATE = 150_000;

function str(value, max) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '';
}

/** The maker's own state (words and settings), kept as plain JSON with a size cap; the maker re-checks it on load. */
function cleanState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  try {
    const text = JSON.stringify(state);
    return text.length <= MAX_STATE ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function httpsUrl(value, host) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    if (host && !host.test(url.hostname)) return '';
    return url.href.slice(0, 600);
  } catch {
    return '';
  }
}

/** A kept video's storage path: <owner id>/kept/<uuid>.mp4. */
function isKeptPath(path, ownerId) {
  if (typeof path !== 'string') return false;
  const m = /^([0-9a-f-]{36})\/kept\/[0-9a-f-]{36}\.mp4$/.exec(path);
  return Boolean(m) && (!ownerId || m[1] === ownerId);
}

// -> the clean embed fields for a video, or null when this is not a usable one.
function sanitizeVideo(input) {
  if (!input || typeof input !== 'object') return null;
  const maker = MAKERS.includes(input.maker) ? input.maker : null;
  const state = cleanState(input.state);
  if (!maker || !state) return null;
  const title = str(input.title, 140) || 'Video';
  const seconds = Number(input.seconds);
  const videoPath = isKeptPath(input.videoPath) ? input.videoPath : '';
  const coverUrl = httpsUrl(input.coverUrl);
  const youtubeUrl = httpsUrl(input.youtubeUrl, /(^|\.)youtube\.com$|(^|\.)youtu\.be$/);
  return {
    maker,
    title,
    state,
    vertical: Boolean(input.vertical),
    ...(Number.isFinite(seconds) && seconds > 0 ? { seconds: Math.round(Math.min(seconds, 600) * 10) / 10 } : {}),
    ...(videoPath ? { videoPath } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    ...(youtubeUrl ? { youtubeUrl } : {}),
    ...(input.shared === true ? { shared: true } : {}),
  };
}

// -> the clean embed fields for an article, or null.
function sanitizeArticle(input) {
  if (!input || typeof input !== 'object') return null;
  const article = input.article;
  if (!article || typeof article !== 'object' || !Array.isArray(article.sections)) return null;
  const title = str(article.title, 200);
  if (title.length < 3) return null;
  const sections = article.sections
    .slice(0, 14)
    .map((section) => ({
      heading: str(section && section.heading, 160),
      paragraphs: Array.isArray(section && section.paragraphs) ? section.paragraphs.slice(0, 10).map((p) => str(p, 2400)).filter(Boolean) : [],
    }))
    .filter((section) => section.heading || section.paragraphs.length);
  if (sections.length === 0) return null;
  const length = ['short', 'normal', 'long'].includes(input.length) ? input.length : 'normal';
  return {
    title,
    article: { title, dek: str(article.dek, 400), sections, closing: str(article.closing, 1200) },
    topic: str(input.topic, 1500),
    audience: str(input.audience, 300),
    length,
    ...(input.shared === true ? { shared: true } : {}),
  };
}

module.exports = { MAKERS, sanitizeVideo, sanitizeArticle, isKeptPath };
