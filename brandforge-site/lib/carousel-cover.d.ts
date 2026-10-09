export interface CoverStyle { id: string; label: string; suffix: string }
export declare const STYLES: CoverStyle[];
export declare const STYLE_IDS: string[];
export declare function styleOf(value: unknown): string;
export declare function buildCoverPrompt(input: { scene?: string; headline?: string; style?: string; variant?: number }): string;
