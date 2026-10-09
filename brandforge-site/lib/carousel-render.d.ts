type Drawable = CanvasImageSource | null;
export interface CarouselBrand { name?: string; handle?: string; accent?: string; logo?: CanvasImageSource | null }
export interface CarouselOptions { theme?: string; brand?: CarouselBrand }
export interface ThemeInfo { id: string; label: string; accent: string; bg: string; light: boolean; art: 'burst' | 'shards' | 'rings' | 'soft' }
export declare const W: number;
export declare const H: number;
export declare const THEMES: Record<string, { label: string; bg: string; text: string; accent: string; muted: string; art: string; light: boolean }>;
export declare const THEME_LIST: ThemeInfo[];
export declare function parseAccent(value: string): { text: string; accent: boolean }[];
export declare function cleanText(value: unknown, max: number): string;
export declare function drawCover(ctx: CanvasRenderingContext2D, cover: { headline: string; subtitle?: string; kicker?: string; art: Drawable }, options?: CarouselOptions): void;
export declare function drawItem(
  ctx: CanvasRenderingContext2D,
  item: { n: number; name: string; tag?: string; bullets: string[]; shot: Drawable; crop?: { x: number; y: number; w: number; h: number } },
  options?: CarouselOptions
): void;
export declare function drawCta(ctx: CanvasRenderingContext2D, cta: { headline: string; button: string; note?: string; art: Drawable }, options?: CarouselOptions): void;
