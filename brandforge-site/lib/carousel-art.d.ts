export interface ArtOptions {
  art?: 'burst' | 'shards' | 'rings' | 'soft';
  theme?: string;
  variant?: 'cover' | 'cta';
  seed?: string | number;
  accent?: string;
  createCanvas?: (w: number, h: number) => unknown;
}
export declare function drawArt(w: number, h: number, options?: ArtOptions): HTMLCanvasElement;
export declare function hashSeed(text: string): number;
