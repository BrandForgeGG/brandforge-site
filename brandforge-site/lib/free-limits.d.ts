export type LimitKind = 'creation' | 'video' | 'channel';
export const FREE_LIMITS: Readonly<Record<LimitKind, number>>;
export function monthKey(date?: Date): string;
export function allowance(kind: LimitKind, used: number, tier: string): { ok: boolean; limit: number | null; left: number | null };
export const PRO_LIMITS: Readonly<Partial<Record<LimitKind, number>>>;
export function limitMessage(kind: LimitKind, tier?: string): string;
