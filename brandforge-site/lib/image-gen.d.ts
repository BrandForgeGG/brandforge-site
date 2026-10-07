export type ImageGenResult =
  | { ok: true; bytes: Uint8Array; contentType: string; provider: string; attempts: string[] }
  | { ok: false; reason: 'blocked' | 'empty' | 'unavailable'; attempts: string[] };

export declare function generateImage(options: {
  prompt: string;
  aspect?: 'square' | 'portrait' | 'landscape';
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}): Promise<ImageGenResult>;
export declare function sniffImage(bytes: Uint8Array | null | undefined): string | null;
export declare function cleanPrompt(text: unknown): string;
export declare function isBlockedPrompt(prompt: string): boolean;
export declare function resetCooldowns(): void;
export declare const ORDER: string[];
