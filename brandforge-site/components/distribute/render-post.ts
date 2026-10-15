import { emptyDraft, loadFonts, renderSlide, slideCount, slideFileName, type Draft, type Theme } from '@/components/carousel/carousel-shared';
import { renderImage, imageFileName } from '@/components/image/image-shared';
import { fallbackVisual, type PlannedPost, type PostVisual } from '@/lib/distribute-plan.js';
import type { PictureShape } from '@/lib/network-formats.js';
import type { ImageFormat } from '@/lib/image-kinds.js';

// Drawing a planned post's picture. One place for the thumbnail on the page and for the files people download, so what
// they see is exactly what they get.
export type PostBrand = { name: string; handle: string };

export function visualOf(post: PlannedPost): PostVisual {
  return post.visual ?? fallbackVisual({ angle: post.angle, topic: post.topic, format: post.format, cta: post.cta });
}

export function carouselDraft(visual: Extract<PostVisual, { type: 'carousel' }>, theme: string, brand: PostBrand, seed: string): Draft {
  return { ...emptyDraft(), plan: visual.plan, theme: theme as Theme, brand: { name: brand.name, handle: brand.handle, accent: '' }, seed: seed.slice(-6), coverStyle: 'drawn' };
}

// The image format each network shape is drawn at (carousels keep their own slide size).
const SHAPE_FORMAT: Record<PictureShape, ImageFormat> = { portrait: 'portrait', wide: 'wide', square: 'square' };

export function drawPost(canvas: HTMLCanvasElement, post: PlannedPost, brand: PostBrand, slide = 0, shape?: PictureShape): void {
  const visual = visualOf(post);
  const theme = post.theme ?? 'forge';
  if (visual.type === 'carousel') {
    renderSlide(canvas, Math.min(slide, slideCount(visual.plan) - 1), carouselDraft(visual, theme, brand, post.id), { items: {}, logo: null });
  } else {
    renderImage(canvas, { kind: visual.kind, format: shape ? SHAPE_FORMAT[shape] : visual.format, copy: visual.copy }, theme, { name: brand.name, handle: brand.handle, accent: '' }, null, post.id);
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/** Whether a post is a single picture (which can be redrawn at each network's shape) rather than a carousel. */
export function isSinglePicture(post: PlannedPost): boolean {
  return visualOf(post).type !== 'carousel';
}

/** Every file for one post: a single picture (at `shape` when given), or all the slides of a carousel. */
export async function postFiles(post: PlannedPost, brand: PostBrand, day: string, shape?: PictureShape): Promise<{ name: string; blob: Blob }[]> {
  await loadFonts();
  const visual = visualOf(post);
  const stamp = `${day}-${post.time.replace(':', '')}`;
  const files: { name: string; blob: Blob }[] = [];
  if (visual.type === 'carousel') {
    const total = slideCount(visual.plan);
    for (let i = 0; i < total; i++) {
      const canvas = document.createElement('canvas');
      drawPost(canvas, post, brand, i);
      const blob = await toBlob(canvas);
      if (blob) files.push({ name: `${stamp}-carousel-${slideFileName(i, total)}`, blob });
    }
  } else {
    const canvas = document.createElement('canvas');
    drawPost(canvas, post, brand, 0, shape);
    const blob = await toBlob(canvas);
    if (blob) files.push({ name: `${stamp}-${imageFileName(visual.kind, shape ? SHAPE_FORMAT[shape] : visual.format)}`, blob });
  }
  return files;
}
