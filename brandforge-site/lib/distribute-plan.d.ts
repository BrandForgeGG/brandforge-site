export interface WeekPost { time: string; format: string; cta: string }
export interface WeekDay { date: string; name: string; focus: string; posts: WeekPost[] }
export interface PlannedPost { id: string; time: string; format: string; cta: string; angle: string; topic: string; caption: string; fallback?: boolean }
export interface PlannedDay { date: string; name: string; focus: string; posts: PlannedPost[] }
export declare const DAY_NAMES: string[];
export declare const DAY_FOCUS: string[];
export declare const SLOT_SETS: Record<number, string[]>;
export declare const FORMAT_CYCLE: string[];
export declare const LIMITS: Record<string, number>;
export declare function perDayOf(value: unknown): number;
export declare function startOf(value: unknown): string;
export declare function addDays(iso: string, n: number): string;
export declare function layoutWeek(input?: { startDate?: string; perDay?: number; seed?: string; allow?: string[] }): WeekDay[];
export declare function buildAnglesPrompt(input: { source: string; count: number; site?: string }): { system: string; user: string };
export declare function normalizeAngles(raw: unknown, count: number): { ok: true; summary: string; voice: string; angles: string[] } | { ok: false; error: string };
export declare function buildDayPrompt(input: { summary: string; voice?: string; brand?: string; site?: string; day: { name: string; focus: string }; posts: { format: string; angle: string; closing: string }[] }): { system: string; user: string };
export declare function normalizeDay(raw: unknown, expected: { closing: string }[]): ({ topic: string; caption: string } | null)[];
export declare function fallbackPost(input: { angle: string; format: string; closing: string }): { topic: string; caption: string; fallback: true };
export declare function assembleWeek(input: { week: WeekDay[]; angles: string[]; written: (({ topic: string; caption: string } | null)[] | null)[]; site?: string; brand?: string; seed?: string }): PlannedDay[];
export declare function closingsFor(input: { week: WeekDay[]; dayIndex: number; site?: string; brand?: string; seed?: string }): string[];
export declare function anglesFor(input: { week: WeekDay[]; dayIndex: number; angles: string[] }): string[];
export declare function withClosing(caption: string, closing: string): string;
export declare function extractJson(raw: unknown): Record<string, unknown> | null;
