export declare const DEFAULT_TTL_DAYS: number;
export declare function createJoinToken(
  conversationId: string,
  secret: string,
  options?: { ttlDays?: number; now?: number }
): string | null;
export declare function verifyJoinToken(token: unknown, secret: string, now?: number): string | null;
