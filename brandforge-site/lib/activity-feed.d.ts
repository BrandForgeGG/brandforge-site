export type ActivityKind = 'joined' | 'chat' | 'carousel' | 'shared' | 'published' | 'listing' | 'applied' | 'contract';
export type ActivityActor = { email?: string | null; role?: string | null; source?: string | null; username?: string | null } | null;
export type ActivityRow = { at: string; actor?: ActivityActor; name?: string; title?: string; image?: string; distribute?: boolean; network?: string; url?: string; request?: boolean; specialty?: string };
export type ActivityItem = { kind: ActivityKind; at: string; who: string; text: string; href: string; image?: string; external?: boolean };
export const KINDS: ActivityKind[];
export function activityItem(kind: ActivityKind, row: ActivityRow): ActivityItem | null;
export function buildActivity(rowsByKind: Partial<Record<ActivityKind, ActivityRow[]>>, limit?: number): ActivityItem[];
