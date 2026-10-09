'use strict';

// What gets saved for a person's carousel: a clamped copy of the plan, their look and brand text, and
// their captions. Logos and pictures stay in their browser and are never stored. Pure, so the API and
// the tests share one definition of "a valid draft".
const { normalizePlan, TYPES } = require('./carousel-plan');
const { PLATFORMS } = require('./carousel-captions');

const THEME_IDS = ['forge', 'crystal', 'mono'];

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeBrand(brand) {
  const b = brand && typeof brand === 'object' ? brand : {};
  const accent = /^#[0-9a-f]{6}$/i.test(String(b.accent || '')) ? String(b.accent).toLowerCase() : '';
  return { name: clean(b.name, 28), handle: clean(b.handle, 40), accent };
}

function sanitizeCaptions(captions) {
  const c = captions && typeof captions === 'object' ? captions : {};
  const out = {};
  for (const [key, p] of Object.entries(PLATFORMS)) {
    const text = String(c[key] == null ? '' : c[key]).replace(/\r/g, '').trim().slice(0, p.limit);
    if (text) out[key] = text;
  }
  return out;
}

/** @returns {{ ok: true, draft: object } | { ok: false, error: string }} */
function sanitizeDraft(input) {
  const data = input && typeof input === 'object' ? input : {};
  const checked = normalizePlan(data.plan, { count: 10 });
  if (!checked.ok) return { ok: false, error: 'That carousel could not be saved: ' + checked.error };
  const type = Object.prototype.hasOwnProperty.call(TYPES, data.type) ? data.type : 'list';
  const theme = THEME_IDS.includes(data.theme) ? data.theme : 'forge';
  const planned = data.plannedFor ? new Date(String(data.plannedFor)) : null;
  return {
    ok: true,
    draft: {
      title: clean(String(checked.plan.cover.headline).replace(/\*/g, ''), 120),
      type,
      theme,
      plan: checked.plan,
      brand: sanitizeBrand(data.brand),
      captions: sanitizeCaptions(data.captions),
      plannedFor: planned && !Number.isNaN(planned.getTime()) ? planned.toISOString() : null,
    },
  };
}

module.exports = { THEME_IDS, sanitizeBrand, sanitizeCaptions, sanitizeDraft };
