export declare const MAX_IMAGE_BYTES: number;
export declare function sniff(bytes: Uint8Array | null | undefined): string | null;
export declare function fetchImageSafe(
  rawUrl: string,
  options?: { fetchImpl?: typeof fetch; lookupImpl?: unknown; timeoutMs?: number; maxBytes?: number }
): Promise<{ bytes: Uint8Array; contentType: string }>;
