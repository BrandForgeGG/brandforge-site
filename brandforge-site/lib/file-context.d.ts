// Types for the dependency-free CommonJS file-context builder (lib/file-context.js).

export interface FileContextItem {
  name?: string;
  contentType?: string;
  size?: number;
  text?: string | null;
}

export declare const READABLE_TYPES: Set<string>;
export declare const MAX_FILE_CHARS: number;
export declare const MAX_TOTAL_CHARS: number;

export declare function isDirectlyReadable(contentType: string | null | undefined): boolean;
export declare function formatBytes(size: unknown): string;
export declare function buildFileContextBlock(items: FileContextItem[] | null | undefined): string;
