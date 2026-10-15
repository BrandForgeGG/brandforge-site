'use strict';

// Launch videos, the pure part: the prompt that turns a website (or a few sentences) into a launch story, and the checks
// that turn the writer's answer into timed scenes the browser can draw. The story follows the shape of a product launch:
// a hook, the pain it removes, a look at the real site, what it does, how it works, real proof, and the call to action.

const { readSeconds } = require('./video-scenes.js');

const KINDS = ['hook', 'problem', 'tour', 'features', 'steps', 'proof', 'cta'];

// The voice of the video, chosen by the person (an idea from latent-spaces/brag: a tone you pick beats a tone you hope for).
const TONES = {
  bold: 'Bold: short, punchy lines with momentum. Confident, never shouty.',
  calm: 'Calm: clear, warm and unhurried. Plain words, room to breathe.',
  playful: 'Playful: light and witty, with one unexpected turn of phrase. Never silly about facts.',
  premium: 'Premium: restrained and precise. Fewer words, each one chosen.',
};
const TONE_IDS = Object.keys(TONES);

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[*_`#]/g, '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanList(list, max, size) {
  return (Array.isArray(list) ? list : []).map((item) => clean(item, size)).filter(Boolean).slice(0, max);
}

/** The system and user lines for the writer. site may be null when the person only described the product. */
function buildLaunchPrompt({ site, about, hasPictures, tone }) {
  const voiceOfVideo = TONES[tone] || TONES.bold;
  const system = [
    'You write short product launch videos, like the ones startups post on launch day.',
    'Answer with JSON only, in this exact shape:',
    '{"hook":{"heading":"","accent":"","sub":"","voice":""},',
    '"problem":{"heading":"","chips":["","",""],"voice":""},',
    '"tour":{"heading":"","voice":""},',
    '"features":{"heading":"","items":[{"title":"","note":""}],"voice":""},',
    '"steps":{"heading":"","items":[{"title":"","note":""}],"voice":""},',
    '"proof":{"heading":"","voice":""},',
    '"cta":{"line":"","button":"","voice":""},',
    '"share":{"caption":"","linkedin":""}}',
    'Rules:',
    `- Tone: ${voiceOfVideo}`,
    '- The hook must stop the scroll in the first two seconds: the result, the tension or the surprise, never a greeting.',
    '- share.caption: the post that goes with the video, at most 220 characters, hook first, no hashtag walls (two at most).',
    '- share.linkedin: 2 to 4 short lines for LinkedIn, specific, no engagement-bait question.',
    '- heading: at most 7 words, a statement, no question marks. accent: one word from the hook heading to colour.',
    '- sub and note: at most 12 words. chips: 3 to 5 items of 1 to 3 words, the jobs or tools the product replaces.',
    '- features: 3 to 6 items; steps: exactly 3 items. title: 1 to 4 words.',
    '- voice: what the narrator says during that scene, one or two plain spoken sentences, at most 28 words. Together the',
    '  voices read as one script of about 35 seconds. Say the product name in the hook or tour and again in the cta.',
    '- cta.line: at most 8 words. cta.button: 2 or 3 words, the action the site offers (for example "Start free").',
    '- Use only facts from the material given. Never invent numbers, prices, customers, reviews, awards or results.',
    '  No superlatives you cannot prove ("best", "#1", "fastest"). If the material does not support a scene, set it to null.',
    hasPictures ? '- proof: the video shows real pictures from the site under this heading. Keep it factual.' : '- Set proof to null.',
    site ? '' : '- Set tour to null: there is no website to show.',
  ]
    .filter(Boolean)
    .join('\n');
  const material = site
    ? [
        `Website: ${site.url}`,
        `Name: ${site.name}`,
        `Title: ${site.title}`,
        site.description ? `Description: ${site.description}` : '',
        site.headings.length ? `Headings: ${site.headings.join(' | ')}` : '',
        `Page text: ${site.text}`,
        about ? `The maker adds: ${about}` : '',
      ]
    : [`The product, in the maker's words: ${about}`];
  return { system, user: material.filter(Boolean).join('\n').slice(0, 6000) };
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

function items(list, max, min) {
  const out = (Array.isArray(list) ? list : [])
    .map((item) => (typeof item === 'string' ? { title: clean(item, 40), note: '' } : { title: clean(item && item.title, 40), note: clean(item && item.note, 90) }))
    .filter((item) => item.title)
    .slice(0, max);
  return out.length >= min ? out : null;
}

function timed(scene, extra = 0) {
  return { ...scene, seconds: Math.round((readSeconds(scene.voice) + extra) * 10) / 10 };
}

/**
 * The writer's answer -> { ok: true, scenes } or { ok: false, error }. Scenes are in story order; a scene the material
 * cannot support (or that needs something we do not have, like a website or pictures) is left out.
 */
function normalizeLaunch(raw, { name, hasSite, hasPictures }) {
  const data = parse(raw);
  if (!data || typeof data !== 'object') return { ok: false, error: 'The writer did not answer in the expected shape.' };
  const scenes = [];
  const voiceOf = (part, fallback) => clean(part && part.voice, 220) || fallback;

  const hook = data.hook || {};
  const hookHeading = clean(hook.heading, 70);
  if (!hookHeading) return { ok: false, error: 'The writer left out the opening.' };
  const accent = clean(hook.accent, 30);
  scenes.push(timed({ kind: 'hook', heading: hookHeading, accent: hookHeading.toLowerCase().includes(accent.toLowerCase()) ? accent : '', sub: clean(hook.sub, 90), voice: voiceOf(hook, hookHeading) }, 0.4));

  const problem = data.problem;
  const chips = cleanList(problem && problem.chips, 5, 24);
  if (problem && clean(problem.heading, 70) && chips.length >= 3) {
    scenes.push(timed({ kind: 'problem', heading: clean(problem.heading, 70), chips, voice: voiceOf(problem, clean(problem.heading, 70)) }, 0.6));
  }

  const tour = data.tour;
  if (hasSite && tour && clean(tour.heading, 70)) {
    scenes.push(timed({ kind: 'tour', heading: clean(tour.heading, 70), voice: voiceOf(tour, clean(tour.heading, 70)) }, 1));
  }

  const features = data.features;
  const featureItems = items(features && features.items, 6, 3);
  if (features && featureItems) {
    const heading = clean(features.heading, 70) || 'What it does';
    scenes.push(timed({ kind: 'features', heading, items: featureItems, voice: voiceOf(features, heading) }, 0.8));
  }

  const steps = data.steps;
  const stepItems = items(steps && steps.items, 3, 3);
  if (steps && stepItems) {
    const heading = clean(steps.heading, 70) || 'How it works';
    scenes.push(timed({ kind: 'steps', heading, items: stepItems, voice: voiceOf(steps, heading) }, 0.8));
  }

  const proof = data.proof;
  if (hasPictures && proof && clean(proof.heading, 70)) {
    scenes.push(timed({ kind: 'proof', heading: clean(proof.heading, 70), voice: voiceOf(proof, clean(proof.heading, 70)) }, 0.6));
  }

  const cta = data.cta || {};
  const line = clean(cta.line, 70) || `Try ${name || 'it'} today.`;
  scenes.push(timed({ kind: 'cta', heading: line, button: clean(cta.button, 24) || 'Get started', voice: voiceOf(cta, line) }, 1.2));

  if (scenes.length < 3) return { ok: false, error: 'The writer could not find enough to say about this.' };
  // The post that goes with the video (written from the same plan, so the words match what people see).
  const share = data.share && typeof data.share === 'object' ? { caption: clean(data.share.caption, 280), linkedin: clean(data.share.linkedin, 700) } : { caption: '', linkedin: '' };
  return { ok: true, scenes, share };
}

/** All the words a scene puts on screen or says, for the content policy. */
function launchText(scenes) {
  return scenes
    .map((s) => [s.heading, s.sub, s.button, s.voice, ...(s.chips || []), ...(s.items || []).flatMap((i) => [i.title, i.note])].filter(Boolean).join(' '))
    .join('\n');
}

module.exports = { KINDS, TONES, TONE_IDS, buildLaunchPrompt, normalizeLaunch, launchText };
