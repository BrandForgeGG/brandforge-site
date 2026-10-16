export const MIN_EUROS: number;
export const MAX_EUROS: number;
export function checkCustomTask(input: { title?: unknown; details?: unknown; funds?: unknown }): { ok: true; task: { title: string; details: string; funds: number } } | { ok: false; error: string };
