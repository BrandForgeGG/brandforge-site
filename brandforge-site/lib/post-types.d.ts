export type PostType = 'update' | 'poll' | 'quiz' | 'thread';
export type Post =
  | { type: 'update'; text: string }
  | { type: 'poll'; question: string; options: string[] }
  | { type: 'quiz'; question: string; options: string[]; correct: number; explanation: string }
  | { type: 'thread'; parts: string[] };
export declare const TYPES: Record<PostType, { label: string; hint: string }>;
export declare const LIMITS: Record<string, number>;
export declare function normalizePost(raw: unknown): { ok: true; post: Post } | { ok: false; error: string };
export declare function telegramHtml(text: string): string;
export declare function telegramText(post: Post): string;
export declare function stripMarkup(text: string): string;
export declare function linkFacets(text: string): { index: { byteStart: number; byteEnd: number }; features: { $type: string; uri: string }[] }[];
export declare function blueskyPosts(post: Post): { text: string; facets: ReturnType<typeof linkFacets> }[];
export declare function discordEmbed(post: Post): { description: string; color: number };
export declare function graphemes(text: string): number;
export declare function numbered(options: string[]): string;
