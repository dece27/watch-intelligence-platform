insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'watch-photos',
    'watch-photos',
    false,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  ),
  (
    'appraisal-reports',
    'appraisal-reports',
    false,
    10485760,
    array['application/pdf']
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "watch-photos read own" on storage.objects;
create policy "watch-photos read own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'watch-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "watch-photos insert own" on storage.objects;
create policy "watch-photos insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'watch-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "watch-photos update own" on storage.objects;
create policy "watch-photos update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'watch-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'watch-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "watch-photos delete own" on storage.objects;
create policy "watch-photos delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'watch-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "appraisal-reports read own" on storage.objects;
create policy "appraisal-reports read own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'appraisal-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "appraisal-reports insert own" on storage.objects;
create policy "appraisal-reports insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'appraisal-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "appraisal-reports update own" on storage.objects;
create policy "appraisal-reports update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'appraisal-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'appraisal-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "appraisal-reports delete own" on storage.objects;
create policy "appraisal-reports delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'appraisal-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
