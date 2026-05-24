drop policy if exists "Authenticated read active listings" on public.deal_listings;
drop policy if exists "Anon/authenticated read active listings" on public.deal_listings;

create policy "Anon/authenticated read active listings" on public.deal_listings for select
  using ((auth.role() = 'anon' or auth.role() = 'authenticated') and is_active = true);
