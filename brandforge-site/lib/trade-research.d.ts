export declare function extractUrls(text: string, max?: number): string[];
export declare function buildListingPrompt(input: { text: string; pages?: { url: string; title?: string; text?: string }[]; snippets?: { title: string; snippet?: string; url?: string }[] }): { system: string; user: string };
export declare function normalizeNotes(json: unknown): { found: string[]; tips: string[] };
export declare function isRichDescription(description: unknown): boolean;
export declare const SYSTEM: string;
