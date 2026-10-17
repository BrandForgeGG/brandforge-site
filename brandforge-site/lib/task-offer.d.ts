export type TaskStatus = 'open' | 'countered' | 'accepted' | 'funded' | 'review' | 'delivered';
export type TaskState = { status: TaskStatus; amount: number; counterAmount?: number; counterNote?: string; reviewNote?: string; reviewLink?: string; changesNote?: string };
export const STAGES: TaskStatus[];
export function answerTask(state: TaskState, action: string, input: { amount?: unknown; note?: unknown; link?: unknown } | null, role: 'team' | 'buyer' | 'other'): { ok: true; state: TaskState } | { ok: false; status: number; error: string };
