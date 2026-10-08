export declare function botSessionId(platform: string, userId: string | number, secret: string): string;
export declare const COMMANDS: Record<string, { needs: string; build: (text: string) => string; media?: boolean }>;
export declare function parseCommand(text: string): { name: string; args: string } | null;
export declare function commandToPrompt(command: { name: string; args: string }): { ok: true; prompt: string; media: boolean } | { ok: false; needs: string; media: boolean } | null;
export declare function botCommandPrompt(kind: string, text: string): { prompt: string; media: boolean };
export declare function looksLikeLinkCode(text: string): boolean;
export declare function toPlainChat(markdown: string, limit?: number): string;
export declare function collectStreamText(sseText: string): { text: string; error: string | null };
export declare function parseIdList(value: string | undefined): string[];
