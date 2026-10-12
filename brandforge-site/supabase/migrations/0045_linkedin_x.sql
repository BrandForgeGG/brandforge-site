-- LinkedIn and X channels (2026-10-12): widen the allowed kinds on carousel_channels.
alter table public.carousel_channels drop constraint if exists carousel_channels_kind_check;
alter table public.carousel_channels add constraint carousel_channels_kind_check check (kind in ('telegram','discord','bluesky','slack','tumblr','mastodon','linkedin','x'));
