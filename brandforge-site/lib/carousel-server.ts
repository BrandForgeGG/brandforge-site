import path from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
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
  draw((ctx) => drawCover(ctx, { ...plan.cover, kicker: 'Swipe for more', art: art('cover') }, options));
  for (const item of plan.items) draw((ctx) => drawItem(ctx, { ...item, bullets: item.bullets.filter((line) => line.trim()), shot: null }, options));
  draw((ctx) => drawCta(ctx, { ...plan.cta, art: art('cta') }, options));
  return out;
}
