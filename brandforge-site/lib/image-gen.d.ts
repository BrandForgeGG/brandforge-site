export type ImageGenResult =
  | { ok: true; bytes: Uint8Array; contentType: string; provider: string; attempts: string[] }
  | { ok: false; reason: 'blocked' | 'empty' | 'unavailable'; attempts: string[] };

export declare function generateImage(options: {
  prompt: string;
  aspect?: 'square' | 'portrait' | 'landscape';
  quality?: 'best' | 'fast';
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  /** Providers to leave out, for example 'pollinations' when its watermark is not acceptable. */
  skip?: string[];
  /** 'photo' prefers the SDXL models (fast, photographic) over FLUX. */
  prefer?: 'photo';
}): Promise<ImageGenResult>;
export declare function sniffImage(bytes: Uint8Array | null | undefined): string | null;
export declare function cleanPrompt(text: unknown): string;
export declare function isBlockedPrompt(prompt: string): boolean;
export declare function resetCooldowns(): void;
export declare const ORDER: string[];
