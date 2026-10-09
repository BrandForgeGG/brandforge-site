export declare const PLATFORMS: Record<'instagram' | 'tiktok' | 'linkedin' | 'x' | 'facebook', { label: string; limit: number; hashtags: string; style: string }>;
export declare const SYSTEM: string;
export declare function buildCaptionPrompt(input: { plan: unknown; topic?: string; brandName?: string; handle?: string; cta?: string }): { system: string; user: string };
export declare function normalizeCaptions(raw: unknown): { ok: true; captions: Record<string, string> } | { ok: false; error: string };
export declare function fallbackCaptions(plan: unknown, cta?: string): Record<string, string>;
export declare function fitCaption(text: string, limit: number): string;
