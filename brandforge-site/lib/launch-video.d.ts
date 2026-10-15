import type { SiteRead } from './site-capture.js';

export type LaunchItem = { title: string; note: string };
export type LaunchScene =
  | { kind: 'hook'; heading: string; accent: string; sub: string; voice: string; seconds: number }
  | { kind: 'problem'; heading: string; chips: string[]; voice: string; seconds: number }
  | { kind: 'tour'; heading: string; voice: string; seconds: number }
  | { kind: 'features'; heading: string; items: LaunchItem[]; voice: string; seconds: number }
  | { kind: 'steps'; heading: string; items: LaunchItem[]; voice: string; seconds: number }
  | { kind: 'proof'; heading: string; voice: string; seconds: number }
  | { kind: 'cta'; heading: string; button: string; voice: string; seconds: number };
export type LaunchKind = LaunchScene['kind'];
export const KINDS: LaunchKind[];
export type LaunchTone = 'bold' | 'calm' | 'playful' | 'premium';
export type LaunchShare = { caption: string; linkedin: string };
export const TONES: Record<LaunchTone, string>;
export const TONE_IDS: LaunchTone[];
export function buildLaunchPrompt(input: { site: SiteRead | null; about: string; hasPictures: boolean; tone?: string }): { system: string; user: string };
export function normalizeLaunch(raw: unknown, opts: { name: string; hasSite: boolean; hasPictures: boolean }): { ok: true; scenes: LaunchScene[]; share: LaunchShare } | { ok: false; error: string };
export function launchText(scenes: LaunchScene[]): string;
