import type { Article } from './article.js';

export type VideoMakerId = 'launch' | 'short' | 'long' | 'square';
export type VideoFields = {
  maker: VideoMakerId;
  title: string;
  state: Record<string, unknown>;
  vertical: boolean;
  seconds?: number;
  videoPath?: string;
  coverUrl?: string;
  youtubeUrl?: string;
  shared?: boolean;
};
export type ArticleFields = { title: string; article: Article; topic: string; audience: string; length: 'short' | 'normal' | 'long'; shared?: boolean };
export const MAKERS: VideoMakerId[];
export function sanitizeVideo(input: unknown): VideoFields | null;
export function sanitizeArticle(input: unknown): ArticleFields | null;
export function isKeptPath(path: unknown, ownerId?: string): boolean;
