export const TEAM_SHARE: number;
export const GOAL_CENTS: number;
export const CHATS_PER_CLIENT: number;
export const GOAL_MIX: { plan: string; count: number }[];
export function split(cents: number): { team: number; brandforge: number };
export function planSplits(): { id: string; name: string; cents: number; team: number; brandforge: number }[];
export function goalMix(): { rows: { plan: string; count: number; cents: number }[]; total: number; team: number; brandforge: number; clients: number };
export function pathToGoal(mrrCents: number): { goal: number; mrr: number; gap: number; average: number; clients: number; chats: number; progress: number };
export function euros(cents: number): string;
