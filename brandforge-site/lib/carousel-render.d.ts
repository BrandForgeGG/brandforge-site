type Drawable = CanvasImageSource | null;
export interface CarouselOptions { theme?: 'forge' | 'crystal' | 'mono'; handle?: string }
export declare const W: number;
export declare const H: number;
export declare const THEMES: Record<string, { bg: string; text: string; accent: string; muted: string }>;
export declare function parseAccent(value: string): { text: string; accent: boolean }[];
export declare function cleanText(value: unknown, max: number): string;
export declare function drawCover(ctx: CanvasRenderingContext2D, cover: { headline: string; subtitle?: string; kicker?: string; art: Drawable }, options?: CarouselOptions): void;
export declare function drawItem(
  ctx: CanvasRenderingContext2D,
  item: { n: number; name: string; tag?: string; bullets: string[]; shot: Drawable; crop?: { x: number; y: number; w: number; h: number } },
  options?: CarouselOptions
): void;
export declare function drawCta(ctx: CanvasRenderingContext2D, cta: { headline: string; button: string; note?: string; art: Drawable }, options?: CarouselOptions): void;
