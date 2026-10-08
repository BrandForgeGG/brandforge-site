export type Plan = {
  id: 'free' | 'pro' | 'agency';
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  limits: { workspaces: number; connectedAccounts: number; queuedPosts: number; whiteLabel: boolean; cmsSync: boolean };
  features: string[];
  highlight?: boolean;
};
export const PLANS: Plan[];
export function getPlan(id: string | null | undefined): Plan;
export function effectivePlan(id: string | null | undefined, paidThrough: string | null | undefined, now?: Date): Plan;
