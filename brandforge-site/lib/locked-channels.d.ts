export const LOCKED: Record<string, string>;
export function isLocked(kind: string): boolean;
export function lockedReason(kind: string): string | null;
export function donateUrl(env?: Record<string, string | undefined>): string;
