insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'watch-images',
  'watch-images',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "watch-images read own" on storage.objects;
create policy "watch-images read own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'watch-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "watch-images insert own" on storage.objects;
create policy "watch-images insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'watch-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "watch-images update own" on storage.objects;
create policy "watch-images update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'watch-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'watch-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "watch-images delete own" on storage.objects;
create policy "watch-images delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'watch-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
