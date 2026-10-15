-- Voice cache (2026-10-15): every spoken line is made once on the server (Kokoro, CPU heavy) and kept in a public bucket
-- named by a hash of the voice and the words; the same line asked for again is served from storage, with no CPU used.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice', 'voice', true, 5242880, array['audio/wav'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['audio/wav'];
