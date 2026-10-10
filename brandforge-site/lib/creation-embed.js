'use strict';

// A carousel that lives in the chat as a message. This is the only place its shape is decided: the server uses it
// to accept a new one and the transcript uses it to read one back, so a malformed row can never reach the page.

const THEMES = ['forge', 'crystal', 'mono', 'violet', 'emerald', 'rose', 'sunrise', 'paper'];
const COVER_STYLES = ['photo', 'cinematic', 'render', 'surreal', 'drawn'];

function str(value, max) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '';
}

// -> the clean embed fields, or null when this is not a usable carousel.
function sanitizeCarousel(input) {
  if (!input || typeof input !== 'object') return null;
  const plan = input.plan;
  if (!plan || typeof plan !== 'object' || !plan.cover || !Array.isArray(plan.items)) return null;

  const headline = str(plan.cover.headline, 160);
  if (headline.length < 3) return null;
  const items = plan.items
    .slice(0, 12)
    .map((item, index) => ({
      n: index + 1,
      name: str(item && item.name, 120),
      bullets: Array.isArray(item && item.bullets) ? item.bullets.slice(0, 4).map((bullet) => str(bullet, 220)).filter(Boolean) : [],
    }))
    .filter((item) => item.name);
  if (items.length < 1) return null;

  const cta = plan.cta && typeof plan.cta === 'object' ? plan.cta : {};
  const brand = input.brand && typeof input.brand === 'object' ? input.brand : {};
  const coverUrl = typeof input.coverUrl === 'string' && /^https:\/\/[^\s]+$/.test(input.coverUrl) ? input.coverUrl.slice(0, 600) : '';

  return {
    plan: {
      cover: { headline, subtitle: str(plan.cover.subtitle, 200), scene: str(plan.cover.scene, 300) },
      items,
      cta: { headline: str(cta.headline, 120), button: str(cta.button, 60), note: str(cta.note, 160) },
    },
    theme: THEMES.includes(input.theme) ? input.theme : 'forge',
    coverStyle: COVER_STYLES.includes(input.coverStyle) ? input.coverStyle : 'photo',
    brand: { name: str(brand.name, 60), handle: str(brand.handle, 60), accent: str(brand.accent, 12) },
    cta: str(input.cta, 80),
    topic: str(input.topic, 500),
    ...(coverUrl ? { coverUrl } : {}),
  };
}

module.exports = { THEMES, COVER_STYLES, sanitizeCarousel };
