-- Every email the site tries to send (2026-10-10), so an admin can see who was told what and whether it went out.
-- Recipient, subject and the provider's answer only: never the body. RLS on with no policies: server only.
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  ok boolean not null,
  error text,
  provider_id text,
  created_at timestamptz not null default now()
);
alter table public.email_log enable row level security;
create index if not exists email_log_created_idx on public.email_log (created_at desc);
create index if not exists email_log_to_idx on public.email_log (to_email, created_at desc);
