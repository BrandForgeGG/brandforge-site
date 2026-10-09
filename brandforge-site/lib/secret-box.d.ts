export declare function encryptSecret(plain: string, env?: Record<string, string | undefined>): string;
export declare function decryptSecret(stored: string, env?: Record<string, string | undefined>): string | null;
