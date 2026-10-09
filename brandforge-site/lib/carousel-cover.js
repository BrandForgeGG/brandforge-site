'use strict';

// Cover art for a carousel: a picture of what the post is about, made by an image model. The words
// stay ours (the plan writes a short scene), the style is the person's choice. "drawn" means no
// image model at all: the abstract art the maker always had, drawn in the browser.

const STYLES = [
  { id: 'photo', label: 'Photo', suffix: 'hyperrealistic editorial photograph, 85mm lens, shallow depth of field, natural light, ultra detailed skin and material textures, sharp focus' },
  { id: 'cinematic', label: 'Cinematic', suffix: 'cinematic film still, dramatic side lighting, anamorphic lens, rich moody colour grade, volumetric haze, ultra detailed' },
  { id: 'render', label: '3D render', suffix: 'hyperreal 3D render, glossy and matte materials, soft studio lighting, clean minimal composition, ray traced reflections, ultra detailed' },
  { id: 'surreal', label: 'Surreal', suffix: 'surreal hyperrealistic conceptual photograph, a clever visual metaphor, impossible but believable, crisp detail, dreamlike lighting' },
  { id: 'drawn', label: 'Drawn', suffix: '' },
];

const STYLE_IDS = STYLES.map((style) => style.id);

function styleOf(value) {
  return STYLE_IDS.includes(value) ? value : 'photo';
}

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * The prompt sent to the image model. `scene` is the plan's one-sentence picture of the topic; when a
 * plan has none we fall back to the headline so the art still follows the subject.
 * `variant` (a small number) asks for a different take on the same scene.
 */
function buildCoverPrompt({ scene, headline, style, variant = 0 }) {
  const picked = STYLES.find((entry) => entry.id === styleOf(style)) || STYLES[0];
  if (!picked.suffix) return '';
  const subject = clean(scene, 220) || clean(String(headline || '').replace(/\*/g, ''), 120);
  if (!subject) return '';
  const takes = ['', ', from a low angle', ', wide establishing view', ', tight close-up', ', top-down view'];
  const take = takes[Math.abs(Number(variant) || 0) % takes.length];
  return `${subject}${take}. ${picked.suffix}. Vertical 4:5 composition, subject in the upper two thirds, calm dark area at the bottom. No text, no letters, no logos, no watermark.`;
}

module.exports = { STYLES, STYLE_IDS, styleOf, buildCoverPrompt };
