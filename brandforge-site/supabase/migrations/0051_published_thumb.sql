-- Published posts get a picture (2026-10-14): the first picture of the post, kept in the public creations bucket, so the
-- "Just published" list shows a real preview for every network, including the ones that hide theirs behind a login.
alter table public.published_posts add column if not exists thumb_url text not null default '';
