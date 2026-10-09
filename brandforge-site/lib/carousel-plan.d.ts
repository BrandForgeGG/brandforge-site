export interface CarouselPlan {
  cover: { headline: string; subtitle: string };
  items: { n: number; name: string; bullets: string[] }[];
  cta: { headline: string; button: string; note: string };
}
export type CarouselType = 'list' | 'educational' | 'news' | 'promo' | 'funny' | 'story' | 'explainer';
export declare const LIMITS: Record<string, number>;
export declare const TYPES: Record<CarouselType, { label: string; needsSource: boolean; brief: string }>;
export declare const PLAN_SYSTEM: string;
export declare function buildPlanPrompt(input: { mode: 'words' | 'url' | 'file'; type?: string; topic?: string; sourceText?: string; sourceTitle?: string; count?: number; cta?: string }): { system: string; user: string; count: number; type: CarouselType };
export declare function extractJson(raw: string): unknown;
export declare function normalizePlan(raw: unknown, options?: { count?: number; cta?: string }): { ok: true; plan: CarouselPlan } | { ok: false; error: string };
