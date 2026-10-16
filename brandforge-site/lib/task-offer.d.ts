export type TaskState = { status: 'open' | 'countered' | 'accepted' | 'funded'; amount: number; counterAmount?: number; counterNote?: string };
export function answerTask(state: TaskState, action: string, input: { amount?: unknown; note?: unknown } | null, role: 'team' | 'buyer' | 'other'): { ok: true; state: TaskState } | { ok: false; status: number; error: string };
