-- Private buckets. Every object lives under "<user_id>/..." and is only reachable
-- by its owner (or through short-lived signed URLs issued by the server).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('recordings', 'recordings', false, 52428800,
    array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac']),
  ('documents', 'documents', false, 26214400,
    array['application/pdf', 'text/plain', 'image/png', 'image/jpeg',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  ('exports', 'exports', false, 26214400, null),
  ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "owner reads own files" on storage.objects for select to authenticated
  using (bucket_id in ('recordings', 'documents', 'exports', 'avatars')
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owner uploads own files" on storage.objects for insert to authenticated
  with check (bucket_id in ('recordings', 'documents', 'avatars')
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owner deletes own files" on storage.objects for delete to authenticated
  using (bucket_id in ('recordings', 'documents', 'exports', 'avatars')
         and (storage.foldername(name))[1] = auth.uid()::text);
