-- Profile pictures (2026-10-10). A public bucket so a picture can be shown anywhere; only the server writes to it
-- (service role, after checking who is signed in). Small pictures only: the browser shrinks them to 384 px first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
