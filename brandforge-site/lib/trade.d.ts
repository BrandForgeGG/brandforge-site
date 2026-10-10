export const KINDS: ('offer' | 'request')[];
export const CATEGORIES: string[];
export const CURRENCIES: string[];

export type ListingDraft = {
  kind: 'offer' | 'request';
  category: string;
  title: string;
  description: string;
  currency: string;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
};

export function validateListing(input: unknown): { ok: true; value: ListingDraft } | { ok: false; error: string };
export function budgetLabel(
  listing: { budgetMinCents: number | null; budgetMaxCents: number | null; currency: string },
  formatMoney: (cents: number, currency: string) => string,
): string;
export function guessListing(text: string): {
  kind: 'offer' | 'request';
  category: string;
  title: string;
  description: string;
  currency: string;
  budgetMin: string | null;
  budgetMax: string | null;
};
export function matches(
  listing: { kind: string; category: string; title: string; description: string },
  filter: { kind?: string; category?: string; q?: string },
): boolean;
