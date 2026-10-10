import { drawImagePost, sizeOf } from '@/lib/image-render.js';
import { drawArt } from '@/lib/carousel-art.js';
import { THEMES } from '@/lib/carousel-render.js';
import type { ImageCopy, ImageFormat, ImageKind } from '@/lib/image-kinds.js';
import type { Brand } from '@/components/carousel/carousel-shared';

export type ImageSpec = { kind: ImageKind; format: ImageFormat; copy: ImageCopy };

// Draws one image onto a canvas at its real size (the page scales it down with CSS). `picture` is the painted
// background when there is one; otherwise the look's own drawn art sits behind the words.
export function renderImage(canvas: HTMLCanvasElement, spec: ImageSpec, theme: string, brand: Brand, picture: HTMLImageElement | null, seed: string): void {
  const { w, h } = sizeOf(spec.format);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const look = THEMES[theme] ?? THEMES.forge;
  const art = picture ?? drawArt(w, h, { art: look.art as 'burst' | 'shards' | 'rings' | 'soft', variant: 'cover', seed, accent: brand.accent || look.accent });
  drawImagePost(ctx, spec, { theme, brand: { name: brand.name, handle: brand.handle, accent: brand.accent } }, art);
}

export function imageFileName(kind: ImageKind, format: ImageFormat): string {
  return `brandforge-${kind}-${format}.png`;
}

export function saveBlob(blob: Blob, name: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}
