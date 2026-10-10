import { createCanvas, loadImage } from '@napi-rs/canvas';
import { makeCoverImage } from '@/lib/carousel-cover-image';
import { ensureFonts } from '@/lib/carousel-server';
import { drawArt } from '@/lib/carousel-art.js';
import { THEMES } from '@/lib/carousel-render.js';
import { drawImagePost, sizeOf } from '@/lib/image-render.js';
import type { ImageCopy, ImageFormat, ImageKind } from '@/lib/image-kinds.js';

// Draws a single image (ad, quote, tip, announcement, poll) into a PNG on the server, with the same drawing code
// the browser uses, so the weekly calendar can post real pictures without anyone's browser open.
export type ServerImage = {
  kind: ImageKind;
  format: ImageFormat;
  copy: ImageCopy;
  theme?: string;
  seed?: string;
  brand?: { name?: string; handle?: string; accent?: string };
};

type Ctx2d = CanvasRenderingContext2D;

// Small remembered pictures, so a preview and the post that follows it show the same background.
const pictureCache = new Map<string, Awaited<ReturnType<typeof loadImage>>>();

export function renderImagePng(image: ServerImage, picture?: unknown): Buffer {
  ensureFonts();
  const theme = image.theme && THEMES[image.theme] ? image.theme : 'forge';
  const look = THEMES[theme];
  const brand = { name: image.brand?.name ?? '', handle: image.brand?.handle ?? '', accent: image.brand?.accent ?? '' };
  const { w, h } = sizeOf(image.format);
  const canvas = createCanvas(w, h);
  const art = picture ?? drawArt(w, h, { art: look.art as 'burst', variant: 'cover', seed: image.seed ?? 'server', accent: brand.accent || look.accent, createCanvas: (a: number, b: number) => createCanvas(a, b) });
  drawImagePost(canvas.getContext('2d') as unknown as Ctx2d, image, { theme, brand }, art as CanvasImageSource);
  return canvas.toBuffer('image/png');
}

/** Renders with a painted background from the copy's scene. Falls back to drawn art, never fails because of the picture. */
export async function renderImageWithPicture(image: ServerImage, options: { style?: string; cacheKey?: string } = {}): Promise<Buffer> {
  let picture: unknown;
  const key = options.cacheKey ? `${options.cacheKey}:${options.style ?? 'photo'}` : '';
  try {
    picture = key ? pictureCache.get(key) : undefined;
    if (!picture && options.style !== 'drawn') {
      const made = await makeCoverImage({ scene: image.copy.scene, headline: image.copy.headline.replace(/\*/g, ''), style: options.style ?? 'photo' });
      if (made) {
        picture = await loadImage(Buffer.from(made.bytes));
        if (key) {
          if (pictureCache.size > 40) pictureCache.clear();
          pictureCache.set(key, picture as Awaited<ReturnType<typeof loadImage>>);
        }
      }
    }
  } catch (cause) {
    console.warn('image picture skipped:', cause instanceof Error ? cause.message : cause);
  }
  return renderImagePng(image, picture);
}
