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
export declare const HEAD: string;
export declare const BODY: string;
export declare function hexToRgb(hex: string): [number, number, number];
export declare function inkOn(hex: string): string;
export interface LookInfo { label: string; bg: string; text: string; accent: string; muted: string; art: string; light: boolean; bgRgb: string }
export declare function themeFor(options?: CarouselOptions): LookInfo;
export declare function wrapWords(ctx: CanvasRenderingContext2D, words: { text: string; accent: boolean }[], maxWidth: number): { text: string; accent: boolean }[][];
export declare function drawLine(ctx: CanvasRenderingContext2D, line: { text: string; accent: boolean }[], centerX: number, y: number, theme: { text: string; accent: string }, align: 'center' | 'left'): void;
export declare function fitHeadline(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number, startSize: number, minSize: number): { size: number; lines: { text: string; accent: boolean }[][] };
export declare function coverFit(ctx: CanvasRenderingContext2D, img: Drawable, x: number, y: number, w: number, h: number, alignTop?: boolean, crop?: { x: number; y: number; w: number; h: number }): void;
export declare function brandMark(ctx: CanvasRenderingContext2D, theme: LookInfo, options: CarouselOptions | undefined, x: number, y: number, size: number, align: 'center' | 'left'): void;
