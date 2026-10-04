// Types for the dependency-free CommonJS Blueprint session helpers (lib/blueprint-session.js).

export interface QuotaDecision {
  allowed: boolean;
  quotaDate: string;
  quotaCount: number;
  remaining: number;
}

export interface SessionCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
}

export declare const UUID_PATTERN: RegExp;
export declare function createSessionToken(sessionId: string, secret: string): string;
export declare function verifySessionToken(token: string | null | undefined, secret: string): string | null;
export declare function hashIp(ip: string | null | undefined, secret: string): string | null;
export declare function consumeQuota(
  session: { quota_date?: string | null; quota_count?: number | null } | null | undefined,
  options: { limit: number; now?: number }
): QuotaDecision;
export declare function sessionCookieOptions(ttlDays: number, isSecure?: boolean): SessionCookieOptions;
