-- Pictures for things made in a chat (2026-10-10): the cover of a carousel that is posted as a message. A public bucket so
-- the slide can be drawn from the link; only the server writes to it (after checking who owns the chat).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creations', 'creations', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
