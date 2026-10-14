export type Article = { title: string; dek: string; sections: { heading: string; paragraphs: string[] }[]; closing: string };
export const LIMITS: Record<string, number>;
export const SYSTEM: string;
export function buildArticlePrompt(input: { topic: string; audience?: string; length?: 'short' | 'normal' | 'long' }): { system: string; user: string };
export function normalizeArticle(raw: unknown): { ok: true; article: Article } | { ok: false; error: string };
export function articleMarkdown(article: Article): string;
export function articleText(article: Article): string;
export function wordCount(article: Article): number;
