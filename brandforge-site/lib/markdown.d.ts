// Types for the dependency-free CommonJS Markdown parser (lib/markdown.js).

export type MarkdownInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type MarkdownToken =
  | { type: 'heading'; depth: number; inlines: MarkdownInline[] }
  | { type: 'paragraph'; inlines: MarkdownInline[] }
  | { type: 'quote'; inlines: MarkdownInline[] }
  | { type: 'list'; ordered: boolean; start?: number; items: MarkdownInline[][] }
  | { type: 'code'; lang: string; code: string }
  | { type: 'table'; header: MarkdownInline[][]; rows: MarkdownInline[][][] }
  | { type: 'hr' };

export declare function parseMarkdown(source: string | null | undefined): MarkdownToken[];
export declare function parseInlines(text: string | null | undefined): MarkdownInline[];
