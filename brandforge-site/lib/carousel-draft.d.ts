import type { CarouselPlan } from './carousel-plan';
export interface CarouselBrandText { name: string; handle: string; accent: string }
export interface CarouselDraft {
  title: string;
  type: string;
  theme: 'forge' | 'crystal' | 'mono';
  plan: CarouselPlan;
  brand: CarouselBrandText;
  captions: Record<string, string>;
  plannedFor: string | null;
}
export declare const THEME_IDS: string[];
export declare function sanitizeBrand(brand: unknown): CarouselBrandText;
export declare function sanitizeCaptions(captions: unknown): Record<string, string>;
export declare function sanitizeDraft(input: unknown): { ok: true; draft: CarouselDraft } | { ok: false; error: string };
