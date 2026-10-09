export declare const LABELS: Record<string, string>;
export declare const EPHEMERAL: number;
export declare function menuComponents(siteUrl: string): unknown[];
export declare function answerComponents(continueUrl: string): unknown[];
export declare function modalFor(kind: string): { type: number; data: Record<string, unknown> } | null;
export declare function modalText(interaction: unknown): string;
