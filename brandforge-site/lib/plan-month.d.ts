export const MONTH_LINE: RegExp;
export function currentMonth(lines: string[]): number;
export function monthLines(plan: { name: string; price: string; cadence: string; active: number }, month: number, renewed: boolean): [string, string];
