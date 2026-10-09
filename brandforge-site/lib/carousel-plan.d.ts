export interface CarouselPlan {
  cover: { headline: string; subtitle: string };
  items: { n: number; name: string; bullets: string[] }[];
  cta: { headline: string; button: string; note: string };
}
export declare const LIMITS: Record<string, number>;
export declare const PLAN_SYSTEM: string;
export declare function buildPlanPrompt(input: { mode: 'words' | 'url' | 'file'; topic?: string; sourceText?: string; sourceTitle?: string; count?: number }): { system: string; user: string; count: number };
export declare function extractJson(raw: string): unknown;
export declare function normalizePlan(raw: unknown, options?: { count?: number }): { ok: true; plan: CarouselPlan } | { ok: false; error: string };
