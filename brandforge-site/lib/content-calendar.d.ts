export interface CalendarRow { post_date: string; slot: number; scheduled_at: string; type: string; topic: string; theme: string }
export interface DayPref { weekday: number; slots: { time?: string; type?: string }[] }
export declare const DAY_NAMES: string[];
export declare const SLOT_TIMES: string[];
export declare const POST_TYPES: string[];
export declare const DEFAULT_DAYS: { focus: string; types: string[] }[];
export declare const TOPIC_POOL: Record<string, string[]>;
export declare function mondayOf(dateLike: string | Date): string;
export declare function addDays(iso: string, n: number): string;
export declare function weekDates(mondayIso: string): string[];
export declare function scheduledAt(dateIso: string, time: string): string;
export declare function pickTopic(type: string, dateIso: string, slot: number, used?: string[]): string;
export declare function lookFor(dateIso: string, slot: number): string;
export declare function buildWeekRows(mondayIso: string, prefs?: DayPref[], used?: string[]): CalendarRow[];
