insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
 (
   'watch-photos',
   'watch-photos',
   false,
   10485760,
   array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
 ),
 (
   'appraisal-pdfs',
   'appraisal-pdfs',
   false,
   20971520,
   array['application/pdf']
 )
on conflict (id) do nothing;

drop policy if exists "watch-photos read own" on storage.objects;
drop policy if exists "Users read own watch photos" on storage.objects;
create policy "Users read own watch photos" on storage.objects
 for select to authenticated
 using (
   bucket_id = 'watch-photos'
   and auth.uid()::text = (storage.foldername(name))[1]
 );

drop policy if exists "watch-photos insert own" on storage.objects;
drop policy if exists "Users upload own watch photos" on storage.objects;
create policy "Users upload own watch photos" on storage.objects
 for insert to authenticated
 with check (
   bucket_id = 'watch-photos'
   and auth.uid()::text = (storage.foldername(name))[1]
 );

drop policy if exists "watch-photos update own" on storage.objects;
drop policy if exists "watch-photos delete own" on storage.objects;
drop policy if exists "Users delete own watch photos" on storage.objects;
create policy "Users delete own watch photos" on storage.objects
 for delete to authenticated
 using (
   bucket_id = 'watch-photos'
   and auth.uid()::text = (storage.foldername(name))[1]
 );

drop policy if exists "appraisal-reports read own" on storage.objects;
drop policy if exists "appraisal-reports insert own" on storage.objects;
drop policy if exists "appraisal-reports update own" on storage.objects;
drop policy if exists "appraisal-reports delete own" on storage.objects;
drop policy if exists "Users manage own appraisal PDFs" on storage.objects;
create policy "Users manage own appraisal PDFs" on storage.objects
 for all to authenticated
 using (
   bucket_id = 'appraisal-pdfs'
   and auth.uid()::text = (storage.foldername(name))[1]
 )
 with check (
   bucket_id = 'appraisal-pdfs'
   and auth.uid()::text = (storage.foldername(name))[1]
 );
