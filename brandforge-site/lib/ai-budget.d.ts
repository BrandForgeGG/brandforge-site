export interface BudgetLimits { userDaily: number; alertAt: number; hardCap: number }
export declare const DEFAULTS: BudgetLimits;
export declare function budgetLimits(env?: Record<string, string | undefined>): BudgetLimits;
export declare function utcDayStart(now?: Date | string | number): string;
export declare function decideBudget(usage: { userToday: number; aiToday: number; isStaff?: boolean }, limits?: BudgetLimits): { allowed: boolean; reason: null | 'user_daily' | 'global_cap'; alert: null | 'warn' | 'cap'; message: string };
