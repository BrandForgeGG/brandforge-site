export type PeerMilestone = {
  title: string;
  amountCents: number;
  status: 'pending' | 'submitted' | 'released' | 'disputed' | 'refunded';
  proofUrl: string | null;
  submittedAt: string | null;
  autoReleaseAt: string | null;
  releasedAt: string | null;
  feeCents: number;
  note: string | null;
};

export type PeerContract = {
  payerId: string;
  payeeId: string;
  title: string;
  scope: string;
  currency: string;
  milestones: PeerMilestone[];
  totalCents: number;
  dueDate: string | null;
  status: 'proposed' | 'active' | 'disputed' | 'completed' | 'cancelled';
  signatures: { payer: string | null; payee: string | null };
  fundingStatus: 'none' | 'verifying' | 'funded';
  fundingTx: string | null;
};

export const CURRENCIES: string[];
export const AUTO_RELEASE_HOURS: number;
export const MAX_MILESTONES: number;
export function feePercent(env?: Record<string, string | undefined>): number;
export function computeFee(amountCents: number, percent: number): number;
export function validateDraft(input: unknown):
  | { ok: true; value: { title: string; scope: string; currency: string; milestones: PeerMilestone[]; totalCents: number; dueDate: string | null } }
  | { ok: false; error: string };
export function applyAction(
  contract: PeerContract,
  action: string,
  actor: { userId: string; isStaff?: boolean },
  payload?: Record<string, unknown>,
  now?: Date,
  percent?: number,
): { ok: true; contract: PeerContract; event: string } | { ok: false; status: number; reason: string };
export function settleDue(contract: PeerContract, now?: Date, percent?: number): PeerContract;
export function summarize(contract: PeerContract): { releasedCents: number; feeCents: number; payeeCents: number; totalCents: number };
export function sideOf(contract: PeerContract, userId: string | null | undefined): 'payer' | 'payee' | null;
export function formatMoney(cents: number, currency: string): string;
