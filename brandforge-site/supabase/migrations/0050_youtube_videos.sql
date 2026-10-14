-- YouTube (2026-10-14): a YouTube channel can be linked, and finished videos wait in a private bucket while they are sent.
-- Videos go from the browser straight into the bucket (a signed upload, so the site's 4.5 MB request limit does not apply),
-- the server sends them to YouTube, then deletes them. Private: only the server reads it.
alter table public.carousel_channels drop constraint if exists carousel_channels_kind_check;
alter table public.carousel_channels add constraint carousel_channels_kind_check check (kind in ('telegram','discord','bluesky','slack','tumblr','mastodon','linkedin','x','facebook','instagram','threads','youtube'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 209715200, array['video/mp4'])
on conflict (id) do update set public = false, file_size_limit = 209715200, allowed_mime_types = array['video/mp4'];
