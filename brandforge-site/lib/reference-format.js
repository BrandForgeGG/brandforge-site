'use strict';

// "Make one like this": the pure part. A member shows us a launch video they like; the browser measures its cuts and
// pace, the server listens to it and looks at a few frames, and what comes back is its *format*: how it hooks, how fast it
// cuts, how much it says, how it ends. The launch writer then follows that format with the member's own facts. We copy
// the structure and the pace, never the words, the brand or the footage.

const { TONE_IDS } = require('./launch-video.js');

const HOOK_STYLES = {
  result: 'Result first: open on the outcome the viewer gets.',
  problem: 'Pain first: open on the frustration the product removes.',
  question: 'A sharp question the viewer silently answers yes to (spoken, not written with a question mark on screen).',
  claim: 'A bold, specific claim, said plainly.',
  demo: 'Straight into the product: show it working from the first frame.',
  story: 'A one-line story: who, the moment it went wrong, then the turn.',
};
const HOOK_IDS = Object.keys(HOOK_STYLES);
const BEATS = ['hook', 'problem', 'tour', 'features', 'steps', 'proof', 'cta'];

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const num = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * Cuts from frame-to-frame differences sampled at `fps` (0 to 1, one per sample after the first). A cut is a jump well
 * above the video's own resting level (its median and the recent quiet samples), with a small floor so text changing on a
 * still background still counts as a new scene; cuts closer than 0.6s are one cut (a flash or a dissolve).
 */
function findCuts(diffs, fps) {
  const cuts = [];
  const list = Array.isArray(diffs) ? diffs.map((d) => num(d, 0, 1, 0)) : [];
  const rate = num(fps, 1, 30, 4);
  const sorted = [...list].sort((x, y) => x - y);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  let recent = median;
  list.forEach((d, i) => {
    const t = (i + 1) / rate;
    const cut = d >= 0.022 && d > median * 3 && d > recent * 3;
    if (cut && (cuts.length === 0 || t - cuts[cuts.length - 1] >= 0.6)) cuts.push(Math.round(t * 100) / 100);
    if (!cut) recent = recent * 0.8 + d * 0.2;
  });
  return cuts;
}

/** Shot lengths and spoken pace from the measured video. words is the transcript word count (0 when silent). */
function pacingOf({ duration, cuts, words }) {
  const seconds = Math.round(num(duration, 1, 600, 30) * 10) / 10;
  const marks = (Array.isArray(cuts) ? cuts : []).map((c) => num(c, 0, seconds, 0)).filter((c) => c > 0 && c < seconds).sort((a, b) => a - b);
  const edges = [0, ...marks, seconds];
  const shots = [];
  for (let i = 1; i < edges.length; i++) if (edges[i] - edges[i - 1] > 0.05) shots.push(Math.round((edges[i] - edges[i - 1]) * 10) / 10);
  const avgShot = Math.round((seconds / Math.max(1, shots.length)) * 10) / 10;
  const spoken = num(words, 0, 5000, 0);
  return {
    seconds,
    shots: shots.length,
    avgShot,
    firstCut: marks.length ? marks[0] : seconds,
    wpm: spoken > 0 ? Math.round((spoken / seconds) * 60) : 0,
  };
}

/** How the pace reads in words, for the summary the member sees. */
function paceLabel(avgShot) {
  if (avgShot < 1.6) return 'very fast cuts';
  if (avgShot < 3) return 'fast cuts';
  if (avgShot < 5.5) return 'steady cuts';
  return 'long, calm shots';
}

/** The prompt for the model that looks at the frames and reads the transcript. */
function buildReferencePrompt({ pacing, transcript }) {
  const system = [
    'You study short marketing and launch videos to learn their format, so a different product can follow the same format.',
    'You are given a few frames in order and, when there is speech, the transcript with times.',
    'Answer with JSON only, in this exact shape:',
    '{"hookStyle":"","hook":"","tone":"","captions":"","visuals":"","cta":"","beats":[""],"summary":""}',
    `- hookStyle: one of ${HOOK_IDS.join(', ')}.`,
    '- hook: how the first two seconds grab attention, described as a pattern, at most 16 words. Do not quote the video.',
    `- tone: one of ${TONE_IDS.join(', ')}.`,
    '- captions: how on-screen words look and behave (size, case, position, word-by-word or full lines), at most 14 words.',
    '- visuals: what is on screen most of the time (product UI, people, text cards, b-roll), at most 14 words.',
    '- cta: how it ends and what it asks for, as a pattern, at most 12 words.',
    `- beats: the story in order, 3 to 7 items, each one of ${BEATS.join(', ')}.`,
    '- summary: one plain sentence describing the format, at most 22 words, no brand or product names.',
    'Describe the format only. Never copy its words, names, numbers or claims.',
  ].join('\n');
  const user = [
    `Length: ${pacing.seconds}s. Shots: ${pacing.shots}, about ${pacing.avgShot}s each. First cut at ${pacing.firstCut}s.`,
    pacing.wpm ? `Speech: about ${pacing.wpm} words per minute.` : transcript ? '' : 'No speech: music and on-screen words only.',
    transcript ? `Transcript:\n${clean(transcript, 3000)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

function parse(raw) {
  if (raw && typeof raw === 'object') return raw;
  let text = String(raw || '').trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fenced) text = fenced[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * The format, checked: every field bounded and every choice from a known list. raw may be the model's answer, a format
 * the browser sends back later, or nothing (then the format holds the measured pace only). Returns null when unusable.
 */
function normalizeFormat(raw, measured) {
  const data = parse(raw) || {};
  const base = measured || data;
  const seconds = num(base.seconds, 4, 180, 0);
  if (!seconds) return null;
  const avgShot = num(base.avgShot, 0.3, 60, seconds);
  const beats = (Array.isArray(data.beats) ? data.beats : []).map((b) => clean(b, 12).toLowerCase()).filter((b) => BEATS.includes(b));
  const unique = beats.filter((b, i) => beats.indexOf(b) === i).slice(0, 7);
  const hookStyle = HOOK_IDS.includes(String(data.hookStyle)) ? String(data.hookStyle) : '';
  const tone = TONE_IDS.includes(String(data.tone)) ? String(data.tone) : '';
  const format = {
    seconds: Math.round(seconds * 10) / 10,
    shots: Math.round(num(base.shots, 1, 400, 1)),
    avgShot: Math.round(avgShot * 10) / 10,
    wpm: Math.round(num(base.wpm, 0, 260, 0)),
    hookStyle,
    hook: clean(data.hook, 120),
    tone,
    captions: clean(data.captions, 100),
    visuals: clean(data.visuals, 100),
    cta: clean(data.cta, 90),
    beats: unique.length >= 3 && unique.includes('hook') && unique.includes('cta') ? unique : [],
    summary: clean(data.summary, 160),
  };
  if (!format.summary) format.summary = `${format.seconds}s, ${paceLabel(format.avgShot)}${format.wpm ? `, ${format.wpm} words a minute` : ''}.`;
  return format;
}

/** The lines added to the launch writer's rules so the new video follows the reference format. */
function formatRules(format) {
  if (!format) return [];
  const seconds = Math.min(60, Math.max(12, format.seconds));
  // Scenes in our video hold while the voice speaks, so the reference's pace becomes words per scene.
  const perScene = Math.max(6, Math.min(28, Math.round(((format.wpm || 150) / 60) * Math.max(1.6, Math.min(6, format.avgShot)) * 1.6)));
  const lines = [
    'Follow the format of a reference video the maker likes. Copy its structure and pace, never its words, names or claims.',
    `- Length: the voices together read in about ${Math.round(seconds)} seconds. Each voice at most ${perScene} words.`,
    `- Pace: ${paceLabel(format.avgShot)} (about ${format.avgShot}s a shot). ${format.avgShot < 3 ? 'Short, clipped lines; one idea per scene.' : 'Let each line land; fewer, fuller scenes.'}`,
  ];
  if (format.hookStyle) lines.push(`- Hook: ${HOOK_STYLES[format.hookStyle]}${format.hook ? ` The reference does it like this: ${format.hook}` : ''}`);
  if (format.beats.length) {
    const skip = BEATS.filter((b) => !format.beats.includes(b) && b !== 'hook' && b !== 'cta');
    lines.push(`- Story order of the reference: ${format.beats.join(' -> ')}.${skip.length ? ` Set ${skip.join(', ')} to null.` : ''}`);
  }
  if (format.cta) lines.push(`- Ending: ${format.cta}`);
  if (!format.wpm && format.hookStyle) lines.push('- The reference has no voice-over: keep every voice line very short, the words on screen carry it.');
  return lines;
}

module.exports = { HOOK_STYLES, HOOK_IDS, findCuts, pacingOf, paceLabel, buildReferencePrompt, normalizeFormat, formatRules };
