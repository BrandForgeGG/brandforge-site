export type Actor = { email?: string | null; role?: string | null; source?: string | null };
export declare const STAFF_ROLES: Set<string>;
export declare function isTestEmail(email: string | null | undefined, env?: Record<string, string | undefined>): boolean;
export declare function isRealActor(actor: Actor | null | undefined, env?: Record<string, string | undefined>): boolean;
export declare function allReal(actors: (Actor | null | undefined)[], env?: Record<string, string | undefined>): boolean;
