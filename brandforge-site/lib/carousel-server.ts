import path from 'node:path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { makeCoverImage } from '@/lib/carousel-cover-image';
import { drawCover, drawCta, drawItem, THEMES, W, H } from '@/lib/carousel-render.js';
import { drawArt } from '@/lib/carousel-art.js';
import type { CarouselPlan } from '@/lib/carousel-plan.js';

// Draws a carousel into PNG images on the server, with the same drawing code the browser uses, so the
// bots and the weekly calendar can post real images without anyone's browser open. Fonts come from
// public/fonts (open-licence Anton and Inter), registered once per process.
let fontsRegistered = false;

function ensureFonts(): void {
  if (fontsRegistered) return;
  const dir = path.join(process.cwd(), 'public', 'fonts');
  GlobalFonts.registerFromPath(path.join(dir, 'anton-latin-400-normal.woff2'), 'BFAnton');
  GlobalFonts.registerFromPath(path.join(dir, 'inter-latin-600-normal.woff2'), 'BFInter');
  GlobalFonts.registerFromPath(path.join(dir, 'inter-latin-700-normal.woff2'), 'BFInter');
  fontsRegistered = true;
}

export type ServerCarousel = {
  plan: CarouselPlan;
  theme?: string;
  seed?: string;
  brand?: { name?: string; handle?: string; accent?: string };
  /** A loaded cover picture (see renderCarouselWithCover); without one the cover uses the drawn art. */
  coverImage?: unknown;
};

// A small cast: @napi-rs/canvas draws like the browser canvas, but its types are its own.
type Ctx2d = CanvasRenderingContext2D;

export function renderCarouselPngs(carousel: ServerCarousel): Buffer[] {
  ensureFonts();
  const theme = carousel.theme && THEMES[carousel.theme] ? carousel.theme : 'forge';
  const look = THEMES[theme];
  const brand = { name: carousel.brand?.name ?? '', handle: carousel.brand?.handle ?? '', accent: carousel.brand?.accent ?? '' };
  const options = { theme, brand };
  const seed = carousel.seed ?? 'server';
  const accent = brand.accent || look.accent;
  const factory = (w: number, h: number) => createCanvas(w, h);
  const art = (variant: 'cover' | 'cta') => drawArt(W, H, { art: look.art as 'burst', variant, seed, accent, createCanvas: factory }) as unknown as CanvasImageSource;

  const out: Buffer[] = [];
  const draw = (fn: (ctx: Ctx2d) => void) => {
    const canvas = createCanvas(W, H);
    fn(canvas.getContext('2d') as unknown as Ctx2d);
    out.push(canvas.toBuffer('image/png'));
  };

  const { plan } = carousel;
  draw((ctx) => drawCover(ctx, { ...plan.cover, kicker: 'Swipe for more', art: (carousel.coverImage as CanvasImageSource | undefined) ?? art('cover') }, options));
  for (const item of plan.items) draw((ctx) => drawItem(ctx, { ...item, bullets: item.bullets.filter((line) => line.trim()), shot: null }, options));
  draw((ctx) => drawCta(ctx, { ...plan.cta, art: art('cta') }, options));
  return out;
}

// Small remembered covers, so a preview and the post that follows it show the same picture.
const coverCache = new Map<string, Awaited<ReturnType<typeof loadImage>>>();

/** Renders a carousel with an AI cover painted from the plan's scene. Falls back to drawn art, never fails because of the picture. */
export async function renderCarouselWithCover(carousel: ServerCarousel, options: { style?: string; cacheKey?: string } = {}): Promise<Buffer[]> {
  let coverImage: unknown;
  const key = options.cacheKey ? `${options.cacheKey}:${options.style ?? 'photo'}` : '';
  try {
    coverImage = key ? coverCache.get(key) : undefined;
    if (!coverImage && options.style !== 'drawn') {
      const made = await makeCoverImage({ scene: carousel.plan.cover.scene, headline: carousel.plan.cover.headline, style: options.style ?? 'photo' });
      if (made) {
        coverImage = await loadImage(Buffer.from(made.bytes));
        if (key) {
          if (coverCache.size > 40) coverCache.clear();
          coverCache.set(key, coverImage as Awaited<ReturnType<typeof loadImage>>);
        }
      }
    }
  } catch (cause) {
    console.warn('cover art skipped:', cause instanceof Error ? cause.message : cause);
  }
  return renderCarouselPngs({ ...carousel, coverImage });
}
