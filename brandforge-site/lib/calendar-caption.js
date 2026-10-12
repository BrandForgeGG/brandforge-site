'use strict';

// BrandForge's own calendar captions. Each one is built from the post itself (the carousel's words, the quote, the tip,
// the poll's answers) with a different shape and a different ask every time: sometimes follow, sometimes save, like,
// comment, share, try the site, hire the team or send a message. Deterministic and pure, so it is tested without a model.
const { ctaLine } = require('./caption-cta');

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\*/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function hash(text) {
  let h = 11;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
  return h;
}

// The site a kind of ask points at: hiring goes to the plans, everything else to the home page.
function siteFor(kind, site) {
  const base = String(site || 'brandforge.gg').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return kind === 'hire' ? `${base}/pricing` : base;
}

/**
 * @param {{ format: string, kind: string, seed: string, plan?: object, image?: { copy: object }, brand?: string, site?: string }} input
 * format: carousel | quote | tip | ad | announcement | question; kind: the ask (see caption-cta).
 */
function composeCaption({ format, kind, seed, plan, image, brand = 'BrandForge', site = 'brandforge.gg' }) {
  const ask = ctaLine(kind, { seed, site: siteFor(kind, site), brand });
  const pick = (options) => options[hash(`${seed}:${format}`) % options.length];

  if (format === 'carousel' && plan) {
    const hook = clean(plan.cover && plan.cover.headline, 120);
    const items = (plan.items || []).slice(0, 7).map((item) => clean(item.name, 40)).filter(Boolean);
    const list = items.map((name, i) => `${i + 1}. ${name}`).join('\n');
    return pick([
      () => `${hook}\n\n${list}\n\n${ask}`,
      () => `${hook}\n\nIn this one: ${items.slice(0, 3).join(', ')} and more.\n\n${ask}`,
      () => `Swipe through: ${hook}\n\n${items.length ? `Start with "${items[0]}".` : ''}\n\n${ask}`.replace(/\n\n\n+/g, '\n\n'),
      () => `${hook}?\n\n${items.slice(0, 4).join(' · ')}\n\n${ask}`,
    ])();
  }

  const copy = (image && image.copy) || {};
  const head = clean(copy.headline, 140);
  const sub = clean(copy.sub, 220);
  if (format === 'quote') {
    return pick([() => `"${head}"\n\n${ask}`, () => `${head}\n\nRead it twice.\n\n${ask}`, () => `A thought for today:\n\n"${head}"\n\n${ask}`])();
  }
  if (format === 'tip') {
    return pick([() => `Quick tip: ${head}\n\n${sub}\n\n${ask}`, () => `${head}\n\n${sub}\n\n${ask}`, () => `Try this today: ${head}\n\n${sub}\n\n${ask}`])();
  }
  if (format === 'ad') {
    return pick([() => `${head}\n\n${sub}\n\n${ask}`, () => `${sub}\n\n${head}\n\n${ask}`])();
  }
  if (format === 'announcement') {
    return pick([() => `New: ${head}\n\n${sub}\n\n${ask}`, () => `${head}\n\n${sub}\n\n${ask}`])();
  }
  if (format === 'question') {
    const options = (copy.options || []).map((option, i) => `${String.fromCharCode(65 + i)}) ${clean(option, 40)}`).join('\n');
    return pick([() => `${head}\n\n${options}\n\n${ask}`, () => `${head}\n${options}\n\n${ask}`])();
  }
  return `${head}\n\n${ask}`;
}

module.exports = { composeCaption, siteFor };
