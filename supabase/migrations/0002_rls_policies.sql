alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.watches enable row level security;
alter table public.collection_shares enable row level security;
alter table public.price_alerts enable row level security;
alter table public.market_brand_snapshots enable row level security;
alter table public.auction_results enable row level security;
alter table public.deal_matches enable row level security;
alter table public.news_articles enable row level security;
alter table public.user_news_feed_cache enable row level security;
alter table public.appraisals enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "preferences_manage_own" on public.user_preferences;
create policy "preferences_manage_own" on public.user_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "watches_manage_own" on public.watches;
create policy "watches_manage_own" on public.watches
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "shares_manage_own" on public.collection_shares;
create policy "shares_manage_own" on public.collection_shares
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "price_alerts_manage_own" on public.price_alerts;
create policy "price_alerts_manage_own" on public.price_alerts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "market_brand_snapshots_read_authenticated" on public.market_brand_snapshots;
create policy "market_brand_snapshots_read_authenticated" on public.market_brand_snapshots
  for select to authenticated
  using (true);

drop policy if exists "auction_results_read_authenticated" on public.auction_results;
create policy "auction_results_read_authenticated" on public.auction_results
  for select to authenticated
  using (true);

drop policy if exists "deal_matches_manage_own" on public.deal_matches;
create policy "deal_matches_manage_own" on public.deal_matches
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "news_articles_read_authenticated" on public.news_articles;
create policy "news_articles_read_authenticated" on public.news_articles
  for select to authenticated
  using (true);

drop policy if exists "user_news_feed_cache_manage_own" on public.user_news_feed_cache;
create policy "user_news_feed_cache_manage_own" on public.user_news_feed_cache
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "appraisals_manage_own" on public.appraisals;
create policy "appraisals_manage_own" on public.appraisals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "ai_usage_manage_own" on public.ai_usage;
create policy "ai_usage_manage_own" on public.ai_usage
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
