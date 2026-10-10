export type ImageKind = 'ad' | 'quote' | 'tip' | 'announcement' | 'question';
export type ImageFormat = 'square' | 'portrait' | 'story' | 'wide';
export interface ImageCopy { kicker: string; headline: string; sub: string; button: string; options: string[]; attribution: string; scene: string }
export interface ImageFields {
  kind: ImageKind;
  format: ImageFormat;
  copy: ImageCopy;
  theme: string;
  coverStyle: string;
  brand: { name: string; handle: string; accent: string };
  topic: string;
  coverUrl?: string;
}
export declare const KINDS: Record<ImageKind, { label: string; hint: string; brief: string; placeholder: string }>;
export declare const KIND_IDS: ImageKind[];
export declare const FORMATS: Record<ImageFormat, { label: string; note: string; w: number; h: number }>;
export declare const FORMAT_IDS: ImageFormat[];
export declare const THEMES: string[];
export declare const COVER_STYLES: string[];
export declare const LIMITS: Record<string, number>;
export declare function kindOf(value: unknown): ImageKind;
export declare function formatOf(value: unknown): ImageFormat;
export declare function buildImagePrompt(input: { kind?: string; topic?: string; button?: string }): { system: string; user: string; kind: ImageKind };
export declare function normalizeImageCopy(raw: unknown, kind: string, options?: { button?: string }): { ok: true; copy: ImageCopy } | { ok: false; error: string };
export declare function sanitizeCopy(input: unknown): ImageCopy;
export declare function sanitizeImage(input: unknown): ImageFields | null;
export declare function imageCaption(image: { kind: ImageKind; copy: ImageCopy }, closing?: string): string;
export declare function extractJson(raw: unknown): Record<string, unknown> | null;
