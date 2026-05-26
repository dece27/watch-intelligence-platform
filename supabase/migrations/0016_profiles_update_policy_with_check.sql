drop policy if exists "Users update own profile" on public.profiles;

create policy "Users update own profile" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
