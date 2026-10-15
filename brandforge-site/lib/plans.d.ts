export type Plan = {
  id: 'free' | 'pro';
  name: string;
  cents: number;
  aiDaily: number;
  price: string;
  cadence: string;
  blurb: string;
  features: string[];
  highlight?: boolean;
};
export type Retainer = {
  id: 'starter' | 'growth' | 'build' | 'custom';
  name: string;
  cents: number;
  price: string;
  cadence: string;
  blurb: string;
  bestFor: string;
  features: string[];
  highlight?: boolean;
};
export const RETAINERS: Retainer[];
export function getRetainer(id: string | null | undefined): Retainer | null;
export const PLANS: Plan[];
export function getPlan(id: string | null | undefined): Plan;
export function getPaidPlan(id: string | null | undefined): Plan | Retainer | null;
export function effectivePlan(id: string | null | undefined, paidThrough: string | null | undefined, now?: Date): Plan;
