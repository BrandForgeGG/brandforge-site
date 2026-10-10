-- Monthly team plans paid by card (2026-10-10). One row per Stripe subscription, written only by the server when Stripe's
-- signed webhook calls. RLS on with no policies: nobody reads or writes it from a browser.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  plan text not null,
  status text not null,
  stripe_customer_id text,
  stripe_subscription_id text not null unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, updated_at desc);
alter table public.subscriptions enable row level security;
