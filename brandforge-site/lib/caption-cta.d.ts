export type CtaKind = 'follow' | 'save' | 'like' | 'comment' | 'share' | 'try' | 'hire' | 'dm';
export declare const KINDS: CtaKind[];
export declare const BY_FORMAT: Record<string, CtaKind[]>;
export declare const LINES: Record<CtaKind, string[]>;
export declare function pickCta(input?: { format?: string; seed?: string | number; previous?: string; allow?: string[] }): CtaKind;
export declare function ctaLine(kind: string, options?: { seed?: string | number; site?: string; brand?: string }): string;
export declare function ctaPlan(formats: string[], seed: string | number, allow?: string[]): CtaKind[];
