export const MAX_ATTEMPTS: number;
export const MAX_SLIDES: number;
export const STUCK_AFTER_MS: number;
export function validateSchedule(input: unknown, nowMs?: number): { ok: true; runAt: string } | { ok: false; error: string };
export function dueRows<T extends { status: string; run_at: string; attempts?: number }>(rows: T[], nowMs?: number): T[];
export function outcomeOf(results: Record<string, { ok: boolean } | undefined>): 'done' | 'partial' | 'failed';
export function isStuck(row: { status: string; run_at: string; claimed_at?: string | null }, nowMs?: number): boolean;
