alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.user_preferences enable row level security;
alter table public.share_tokens enable row level security;
alter table public.watches enable row level security;
alter table public.watch_photos enable row level security;
alter table public.watch_service_records enable row level security;
alter table public.portfolio_snapshots enable row level security;
alter table public.market_price_history enable row level security;
alter table public.market_data_cache enable row level security;
alter table public.price_alerts enable row level security;
alter table public.deal_listings enable row level security;
alter table public.saved_deals enable row level security;
alter table public.news_cache enable row level security;
alter table public.news_relevance_scores enable row level security;
alter table public.news_preferences enable row level security;
alter table public.news_saved enable row level security;
alter table public.appraisals enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.feedback enable row level security;

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

drop policy if exists "subscriptions_manage_own" on public.subscriptions;
create policy "subscriptions_manage_own" on public.subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "preferences_manage_own" on public.user_preferences;
create policy "preferences_manage_own" on public.user_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "share_tokens_manage_own" on public.share_tokens;
create policy "share_tokens_manage_own" on public.share_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "watches_manage_own" on public.watches;
create policy "watches_manage_own" on public.watches
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "watch_photos_manage_own" on public.watch_photos;
create policy "watch_photos_manage_own" on public.watch_photos
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "watch_service_records_manage_own" on public.watch_service_records;
create policy "watch_service_records_manage_own" on public.watch_service_records
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "portfolio_snapshots_manage_own" on public.portfolio_snapshots;
create policy "portfolio_snapshots_manage_own" on public.portfolio_snapshots
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "market_price_history_read_authenticated" on public.market_price_history;
create policy "market_price_history_read_authenticated" on public.market_price_history
  for select to authenticated
  using (true);

drop policy if exists "market_data_cache_read_authenticated" on public.market_data_cache;
create policy "market_data_cache_read_authenticated" on public.market_data_cache
  for select to authenticated
  using (true);

drop policy if exists "price_alerts_manage_own" on public.price_alerts;
create policy "price_alerts_manage_own" on public.price_alerts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "deal_listings_read_authenticated" on public.deal_listings;
create policy "deal_listings_read_authenticated" on public.deal_listings
  for select to authenticated
  using (true);

drop policy if exists "saved_deals_manage_own" on public.saved_deals;
create policy "saved_deals_manage_own" on public.saved_deals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "news_cache_read_authenticated" on public.news_cache;
create policy "news_cache_read_authenticated" on public.news_cache
  for select to anon, authenticated
  using (true);

drop policy if exists "news_relevance_manage_own" on public.news_relevance_scores;
create policy "news_relevance_manage_own" on public.news_relevance_scores
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "news_preferences_manage_own" on public.news_preferences;
create policy "news_preferences_manage_own" on public.news_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "news_saved_manage_own" on public.news_saved;
create policy "news_saved_manage_own" on public.news_saved
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "appraisals_manage_own" on public.appraisals;
create policy "appraisals_manage_own" on public.appraisals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "ai_usage_logs_manage_own" on public.ai_usage_logs;
create policy "ai_usage_logs_manage_own" on public.ai_usage_logs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "feedback_insert_authenticated" on public.feedback;
create policy "feedback_insert_authenticated" on public.feedback
  for insert to authenticated
  with check (user_id = auth.uid() or user_id is null);

drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own" on public.feedback
  for select to authenticated
  using (user_id = auth.uid());
