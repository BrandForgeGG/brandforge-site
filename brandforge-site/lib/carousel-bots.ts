import { makeCarouselPlan } from '@/lib/carousel-service';
import { renderCarouselWithCover } from '@/lib/carousel-server';
import { fallbackCaptions } from '@/lib/carousel-captions.js';
import { THEME_LIST } from '@/lib/carousel-render.js';

// Out of the box a carousel made in a chat app carries BrandForge's name, address and closing line, the
// same defaults as the website. The person edits all of it, and removes it, at brandforge.gg/create.
export const BRAND = { name: 'BrandForge', handle: 'brandforge.gg', accent: '' };
export const CLOSING_LINE = 'Try it free at brandforge.gg';

export type BotCarousel = { ok: true; images: Buffer[]; caption: string; headline: string } | { ok: false; message: string };

// Words in, images out, for the Telegram and Discord bots (and anything else that wants a carousel in
// one call). The look is picked from the words so different topics do not all look the same.
export async function carouselForBot(topic: string, options: { type?: string; theme?: string } = {}): Promise<BotCarousel> {
  const words = topic.trim();
  if (words.length < 8) return { ok: false, message: 'Say a little more about what the carousel is about, in a sentence.' };
  const result = await makeCarouselPlan({ mode: 'words', type: options.type, topic: words, cta: CLOSING_LINE, count: 7 });
  if (!result.ok) return { ok: false, message: result.error };
  let hash = 0;
  for (const ch of words) hash = (hash * 31 + ch.charCodeAt(0)) % 1000003;
  const theme = options.theme && THEME_LIST.some((t: { id: string }) => t.id === options.theme) ? options.theme : THEME_LIST[hash % THEME_LIST.length].id;
  try {
    const images = await renderCarouselWithCover({ plan: result.plan, theme, seed: words, brand: BRAND }, { style: 'photo' });
    const caption = fallbackCaptions(result.plan, CLOSING_LINE).facebook;
    return { ok: true, images, caption, headline: result.plan.cover.headline.replace(/\*/g, '') };
  } catch (cause) {
    console.error('carouselForBot render failed:', cause instanceof Error ? cause.message : cause);
    return { ok: false, message: 'The slides could not be drawn right now. Try again in a moment.' };
  }
}
