import type { LaunchTone } from './launch-video.js';

export type HookStyle = 'result' | 'problem' | 'question' | 'claim' | 'demo' | 'story';
export type ReferencePacing = { seconds: number; shots: number; avgShot: number; firstCut: number; wpm: number };
export type ReferenceFormat = {
  seconds: number;
  shots: number;
  avgShot: number;
  wpm: number;
  hookStyle: HookStyle | '';
  hook: string;
  tone: LaunchTone | '';
  captions: string;
  visuals: string;
  cta: string;
  beats: string[];
  summary: string;
};
export const HOOK_STYLES: Record<HookStyle, string>;
export const HOOK_IDS: HookStyle[];
export function findCuts(diffs: number[], fps: number): number[];
export function pacingOf(input: { duration: number; cuts: number[]; words: number }): ReferencePacing;
export function paceLabel(avgShot: number): string;
export function buildReferencePrompt(input: { pacing: ReferencePacing; transcript: string }): { system: string; user: string };
export function normalizeFormat(raw: unknown, measured?: Partial<ReferencePacing> | null): ReferenceFormat | null;
export function formatRules(format: ReferenceFormat | null): string[];
