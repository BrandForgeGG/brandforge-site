import { drawCover, drawCta, drawItem, THEMES, THEME_LIST, W, H } from '@/lib/carousel-render.js';
import { drawArt } from '@/lib/carousel-art.js';

export type Theme = 'forge' | 'crystal' | 'mono' | 'violet' | 'emerald' | 'rose' | 'sunrise' | 'paper';
export type Mode = 'words' | 'url' | 'file';
export type Item = { n: number; name: string; bullets: string[] };
export type Plan = { cover: { headline: string; subtitle: string; scene?: string }; items: Item[]; cta: { headline: string; button: string; note: string } };
export type Brand = { name: string; handle: string; accent: string };

// Everything the maker keeps between visits and across the sign-in redirect. It lives in this
// browser only: logos and pictures are stored as small data URLs and never leave the device until the
// person saves a carousel, and then only the words and look are saved, never the pictures.
export type Draft = {
  v: 1;
  id: string | null;
  mode: Mode;
  topic: string;
  url: string;
  type: string;
  count: number;
  theme: Theme;
  /** Cover art style: photo, cinematic, render, surreal or drawn (no image model). */
  coverStyle: string;
  seed: string;
  brand: Brand;
  cta: string;
  plan: Plan | null;
  source: { title: string; image: string | null; url: string | null } | null;
  captions: Record<string, string>;
  logo: string | null;
  pictures: Record<number, string>;
};

// Out of the box a carousel carries BrandForge's name, address and closing line. Anyone can change or clear
// them; the draft keeps whatever they choose.
export const DEFAULT_BRAND: Brand = { name: 'BrandForge', handle: 'brandforge.gg', accent: '' };
export const DEFAULT_CTA = 'Try it free at brandforge.gg';

const KEY = 'bf:carousel-draft';

export function emptyDraft(): Draft {
  return { v: 1, id: null, mode: 'words', topic: '', url: '', type: 'list', count: 7, theme: 'forge', coverStyle: 'photo', seed: 'start', brand: { ...DEFAULT_BRAND }, cta: DEFAULT_CTA, plan: null, source: null, captions: {}, logo: null, pictures: {} };
}

const RESUME_KEY = 'bf:carousel-resume';

// A refresh starts a new carousel. Only a deliberate trip away (sign in, Distribute) marks the draft
// to come back, and only for half an hour. Brand, closing line, look and logo are the person's
// settings and always stay.
export function markResume(): void {
  try {
    window.localStorage.setItem(RESUME_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function readStartDraft(): Draft {
  const saved = readDraft();
  let resume = false;
  try {
    const at = Number(window.localStorage.getItem(RESUME_KEY));
    window.localStorage.removeItem(RESUME_KEY);
    resume = Number.isFinite(at) && Date.now() - at < 30 * 60 * 1000;
  } catch {
    resume = false;
  }
  if (resume) return saved;
  return { ...emptyDraft(), brand: saved.brand, cta: saved.cta, theme: saved.theme, coverStyle: saved.coverStyle, logo: saved.logo, count: saved.count };
}

export function readDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return parsed && parsed.v === 1 ? { ...emptyDraft(), ...parsed } : emptyDraft();
  } catch {
    return emptyDraft();
  }
}

export function writeDraft(draft: Draft): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage full (pictures are large): keep the words and look, drop the pictures.
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...draft, pictures: {} }));
    } catch {
      /* storage blocked: the page still works, it just will not remember */
    }
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Shrinks a picked picture so it can be remembered: slides are 1080 wide, so anything larger is waste.
export async function downscale(file: File, maxWidth: number, type: 'image/jpeg' | 'image/png'): Promise<string | null> {
  const source = await loadImage(URL.createObjectURL(file));
  if (!source) return null;
  const scale = Math.min(1, maxWidth / source.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, 0.82);
}

export async function loadFonts(): Promise<void> {
  const faces: [string, string, string][] = [
    ['BFAnton', '/fonts/anton-latin-400-normal.woff2', '400'],
    ['BFInter', '/fonts/inter-latin-600-normal.woff2', '600'],
    ['BFInter', '/fonts/inter-latin-700-normal.woff2', '700'],
  ];
  await Promise.all(
    faces.map(async ([family, url, weight]) => {
      try {
        const face = new FontFace(family, `url(${url})`, { weight });
        await face.load();
        document.fonts.add(face);
      } catch {
        /* the drawing falls back to a system condensed font */
      }
    }),
  );
}

export type Pictures = { items: Record<number, HTMLImageElement | null>; logo: HTMLImageElement | null };

// The illustration for the look, in the person's own colour when they chose one.
function artOptions(draft: Draft, variant: 'cover' | 'cta') {
  const look = THEMES[draft.theme] ?? THEMES.forge;
  return { art: look.art as 'burst' | 'shards' | 'rings' | 'soft', variant, seed: draft.seed, accent: draft.brand.accent || look.accent };
}

// Draws slide `index` (0 = cover, last = closing slide) of a plan onto any canvas.
export function renderSlide(canvas: HTMLCanvasElement, index: number, draft: Draft, pictures: Pictures): void {
  const plan = draft.plan;
  if (!plan) return;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const last = plan.items.length + 1;
  const coverPicture = pictures.items[-1] ?? null;
  const options = { theme: draft.theme, brand: { name: draft.brand.name, handle: draft.brand.handle, accent: draft.brand.accent, logo: pictures.logo } };
  if (index === 0) {
    drawCover(ctx, { ...plan.cover, kicker: 'Swipe for more', art: coverPicture ?? drawArt(W, H, artOptions(draft, 'cover')) }, options);
  } else if (index >= last) {
    drawCta(ctx, { ...plan.cta, art: drawArt(W, H, artOptions(draft, 'cta')) }, options);
  } else {
    const item = plan.items[index - 1];
    drawItem(ctx, { ...item, bullets: item.bullets.filter((line) => line.trim()), shot: pictures.items[index - 1] ?? null }, options);
  }
}

export function slideCount(plan: Plan | null): number {
  return plan ? plan.items.length + 2 : 0;
}

export async function picturesFromDraft(draft: Draft): Promise<Pictures> {
  const items: Record<number, HTMLImageElement | null> = {};
  for (const [key, src] of Object.entries(draft.pictures)) items[Number(key)] = await loadImage(src);
  return { items, logo: draft.logo ? await loadImage(draft.logo) : null };
}

export function slideFileName(index: number, total: number): string {
  return `${String(index + 1).padStart(2, '0')}-${index === 0 ? 'cover' : index === total - 1 ? 'end' : `item-${index}`}.png`;
}

export { W, H, THEME_LIST };
