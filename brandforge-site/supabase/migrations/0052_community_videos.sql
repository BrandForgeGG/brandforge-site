-- Community videos (2026-10-15): a video made on Create (launch videos, shorts, long videos) can be shared to the
-- community like a carousel. The file goes from the browser straight into the public "community-videos" bucket (a signed
-- upload, past the site's 4.5 MB request limit); the post keeps its poster picture in image_urls as before.
alter table public.community_posts add column if not exists video_url text;
alter table public.community_posts add column if not exists video_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-videos', 'community-videos', true, 62914560, array['video/mp4'])
on conflict (id) do update set public = true, file_size_limit = 62914560, allowed_mime_types = array['video/mp4'];
