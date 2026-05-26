drop policy if exists "Users update own watches" on public.watches;

create policy "Users update own watches" on public.watches for update
  using (auth.uid() = user_id and deleted_at is null)
  with check (auth.uid() = user_id);
