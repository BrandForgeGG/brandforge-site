'use strict';

// Video, the pure part: the three shapes a video is made in, and how a planned set of slides (the same plan the carousel
// maker writes) becomes timed scenes, each with the words on screen and the words a voice-over reads. Drawing and encoding
// happen in the browser (components/video); nothing here touches a canvas, so it is tested directly.

const VIDEO_FORMATS = {
  short: { label: 'Short vertical video', note: '9:16, under a minute', w: 1080, h: 1920, maxScenes: 7, maxSeconds: 58 },
  long: { label: 'Long video', note: '16:9 widescreen', w: 1920, h: 1080, maxScenes: 12, maxSeconds: 300 },
  square: { label: 'Video carousel', note: '1:1, slide by slide', w: 1080, h: 1080, maxScenes: 10, maxSeconds: 90 },
};
const VIDEO_FORMAT_IDS = Object.keys(VIDEO_FORMATS);
const FPS = 30;

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\*/g, '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function words(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

/** Seconds a scene stays up: long enough to read (or hear) every word, at about 2.6 words a second, plus a breath. */
function readSeconds(text) {
  return Math.min(12, Math.max(2.6, words(text) / 2.6 + 0.9));
}

function formatOf(value) {
  return Object.prototype.hasOwnProperty.call(VIDEO_FORMATS, value) ? value : 'short';
}

/**
 * A carousel plan -> scenes. [{ kind: 'title' | 'point' | 'end', heading, lines[], voice, seconds }]
 * The title scene opens, each item is a point, the call to action closes. Scenes are trimmed to fit the format.
 */
function planToScenes(plan, format) {
  const f = VIDEO_FORMATS[formatOf(format)];
  const p = plan && typeof plan === 'object' ? plan : {};
  const scenes = [];
  const cover = p.cover || {};
  const title = clean(cover.headline, 90);
  if (title) {
    const sub = clean(cover.subtitle, 80);
    scenes.push({ kind: 'title', heading: title, lines: sub ? [sub] : [], voice: [title, sub].filter(Boolean).join('. ') });
  }
  for (const item of Array.isArray(p.items) ? p.items : []) {
    const heading = clean(item && item.name, 80);
    if (!heading) continue;
    const lines = (Array.isArray(item.bullets) ? item.bullets : []).map((line) => clean(line, 110)).filter(Boolean).slice(0, 3);
    scenes.push({ kind: 'point', heading, lines, voice: [heading, ...lines].join('. ') });
  }
  const cta = p.cta || {};
  const end = clean(cta.headline, 90);
  if (end) {
    const button = clean(cta.button, 30);
    scenes.push({ kind: 'end', heading: end, lines: button ? [button] : [], voice: [end, button].filter(Boolean).join('. ') });
  }
  // Keep the opening and the close, drop points from the middle when there are too many for the format.
  let kept = scenes;
  if (kept.length > f.maxScenes) {
    const last = kept[kept.length - 1].kind === 'end' ? kept.slice(-1) : [];
    kept = [...kept.slice(0, f.maxScenes - last.length), ...last];
  }
  let timed = kept.map((scene) => ({ ...scene, seconds: Math.round(readSeconds(scene.voice) * 10) / 10 }));
  // A short video stays under its limit: every scene is shortened by the same share.
  const total = timed.reduce((sum, scene) => sum + scene.seconds, 0);
  if (total > f.maxSeconds) {
    const share = f.maxSeconds / total;
    timed = timed.map((scene) => ({ ...scene, seconds: Math.max(2, Math.round(scene.seconds * share * 10) / 10) }));
  }
  return timed;
}

/** When a voice-over is longer than a scene, the scene waits for it (plus a short pause). */
function fitToVoice(scenes, voiceSeconds) {
  return scenes.map((scene, i) => {
    const voice = Number(voiceSeconds && voiceSeconds[i]) || 0;
    return voice > 0 ? { ...scene, seconds: Math.round(Math.max(scene.seconds, voice + 0.5) * 10) / 10 } : scene;
  });
}

function totalSeconds(scenes) {
  return Math.round(scenes.reduce((sum, scene) => sum + (Number(scene.seconds) || 0), 0) * 10) / 10;
}

/** Which scene is on screen at time t (seconds), and how far into it. */
function sceneAt(scenes, t) {
  let start = 0;
  for (let i = 0; i < scenes.length; i++) {
    const end = start + scenes[i].seconds;
    if (t < end || i === scenes.length - 1) return { index: i, local: Math.max(0, t - start), start };
    start = end;
  }
  return { index: 0, local: 0, start: 0 };
}

module.exports = { VIDEO_FORMATS, VIDEO_FORMAT_IDS, FPS, readSeconds, planToScenes, fitToVoice, totalSeconds, sceneAt };
