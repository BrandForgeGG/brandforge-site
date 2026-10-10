const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeCarousel } = require('./creation-embed');
const { parseChatEmbed } = require('./message-actions');

const good = {
  plan: {
    cover: { headline: '5 habits of *calm* teams', subtitle: 'Small things that add up', scene: 'A quiet office' },
    items: [
      { n: 9, name: 'Say less', bullets: ['One idea per message', 'Link, do not paste', 'Reply once', 'extra', 'too many'] },
      { n: 2, name: 'Close loops', bullets: ['Name an owner'] },
    ],
    cta: { headline: 'Try it', button: 'Follow', note: 'brandforge.gg' },
  },
  theme: 'crystal',
  coverStyle: 'cinematic',
  brand: { name: 'BrandForge', handle: 'brandforge.gg', accent: '' },
  cta: 'Try it free at brandforge.gg',
  topic: 'calm teams',
  coverUrl: 'https://example.supabase.co/storage/v1/object/public/creations/a.jpg',
};

test('a good carousel is kept, renumbered and trimmed', () => {
  const out = sanitizeCarousel(good);
  assert.equal(out.plan.items[0].n, 1);
  assert.equal(out.plan.items[1].n, 2);
  assert.equal(out.plan.items[0].bullets.length, 4);
  assert.equal(out.theme, 'crystal');
  assert.equal(out.coverUrl, good.coverUrl);
});

test('anything unusable is refused or tidied', () => {
  assert.equal(sanitizeCarousel(null), null);
  assert.equal(sanitizeCarousel({ plan: { cover: { headline: 'x' }, items: [] } }), null);
  assert.equal(sanitizeCarousel({ plan: { cover: { headline: 'Real headline' }, items: [{ name: '' }] } }), null);
  const odd = sanitizeCarousel({ ...good, theme: 'neon', coverStyle: 'oil', coverUrl: 'javascript:alert(1)' });
  assert.equal(odd.theme, 'forge');
  assert.equal(odd.coverStyle, 'photo');
  assert.equal(odd.coverUrl, undefined);
});

test('a stored carousel message reads back as a carousel card', () => {
  const embed = parseChatEmbed({ type: 'carousel', id: 'abc-123', ...sanitizeCarousel(good) });
  assert.equal(embed.type, 'carousel');
  assert.equal(embed.id, 'abc-123');
  assert.equal(embed.plan.cover.headline, '5 habits of *calm* teams');
  assert.equal(parseChatEmbed({ type: 'carousel', id: 'abc', plan: {} }), null);
});
