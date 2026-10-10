import type { TradeListingRow } from '@/lib/project-db';

export function toListingView(row: TradeListingRow, ownerName: string, viewerId: string | null, ownerAvatar: string | null = null, official = false) {
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind,
    category: row.category,
    title: row.title,
    description: row.description,
    currency: row.currency,
    budgetMinCents: row.budget_min_cents == null ? null : Number(row.budget_min_cents),
    budgetMaxCents: row.budget_max_cents == null ? null : Number(row.budget_max_cents),
    ownerName,
    ownerAvatar,
    official,
    mine: viewerId !== null && viewerId === row.owner_id,
    status: row.status,
  };
}

export type ListingView = ReturnType<typeof toListingView>;
