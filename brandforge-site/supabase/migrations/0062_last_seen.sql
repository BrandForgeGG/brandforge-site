-- When each person was last active in the app (a light ping from the sidebar, at most every few minutes). Shown as
-- "seen 5 min ago" on Trade listings and for the BrandForge team in chats. Written by the server only.
alter table public.profiles add column if not exists last_seen_at timestamptz;
