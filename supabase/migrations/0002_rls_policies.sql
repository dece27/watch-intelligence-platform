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

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Public profiles readable" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Public profiles readable" on public.profiles for select using (is_public = true);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- subscriptions
drop policy if exists "subscriptions_manage_own" on public.subscriptions;
drop policy if exists "Users read own subscription" on public.subscriptions;
drop policy if exists "Service role manages subscriptions" on public.subscriptions;
create policy "Users read own subscription" on public.subscriptions for select using (auth.uid() = user_id);
create policy "Service role manages subscriptions" on public.subscriptions for all using (auth.role() = 'service_role');

-- user preferences
drop policy if exists "preferences_manage_own" on public.user_preferences;
drop policy if exists "Users manage own preferences" on public.user_preferences;
create policy "Users manage own preferences" on public.user_preferences for all using (auth.uid() = user_id);

-- share tokens
drop policy if exists "share_tokens_manage_own" on public.share_tokens;
drop policy if exists "Users manage own share tokens" on public.share_tokens;
drop policy if exists "Public read valid token" on public.share_tokens;
create policy "Users manage own share tokens" on public.share_tokens for all using (auth.uid() = user_id);
create policy "Public read valid token" on public.share_tokens for select using (expires_at is null or expires_at > now());

-- watches
drop policy if exists "watches_manage_own" on public.watches;
drop policy if exists "Users read own watches" on public.watches;
drop policy if exists "Shared collection reads" on public.watches;
drop policy if exists "Users insert own watches" on public.watches;
drop policy if exists "Users update own watches" on public.watches;
create policy "Users read own watches" on public.watches for select
  using (auth.uid() = user_id and deleted_at is null);
create policy "Shared collection reads" on public.watches for select
  using (
    deleted_at is null
    and exists (
      select 1
      from public.share_tokens
      where share_tokens.user_id = watches.user_id
        and (share_tokens.expires_at is null or share_tokens.expires_at > now())
    )
  );
create policy "Users insert own watches" on public.watches for insert with check (auth.uid() = user_id);
create policy "Users update own watches" on public.watches for update using (auth.uid() = user_id and deleted_at is null);

-- watch photos
drop policy if exists "watch_photos_manage_own" on public.watch_photos;
drop policy if exists "Users manage own photos" on public.watch_photos;
create policy "Users manage own photos" on public.watch_photos for all using (auth.uid() = user_id);

-- watch service records
drop policy if exists "watch_service_records_manage_own" on public.watch_service_records;
drop policy if exists "Users manage own service records" on public.watch_service_records;
create policy "Users manage own service records" on public.watch_service_records for all using (auth.uid() = user_id);

-- portfolio snapshots
drop policy if exists "portfolio_snapshots_manage_own" on public.portfolio_snapshots;
drop policy if exists "Users read own snapshots" on public.portfolio_snapshots;
drop policy if exists "Service role writes snapshots" on public.portfolio_snapshots;
create policy "Users read own snapshots" on public.portfolio_snapshots for select using (auth.uid() = user_id);
create policy "Service role writes snapshots" on public.portfolio_snapshots for insert
  with check (auth.uid() = user_id or auth.role() = 'service_role');

-- market data
drop policy if exists "market_price_history_read_authenticated" on public.market_price_history;
drop policy if exists "Authenticated read market prices" on public.market_price_history;
drop policy if exists "Service role writes market prices" on public.market_price_history;
create policy "Authenticated read market prices" on public.market_price_history for select using (auth.role() = 'authenticated');
create policy "Service role writes market prices" on public.market_price_history for insert with check (auth.role() = 'service_role');

drop policy if exists "market_data_cache_read_authenticated" on public.market_data_cache;
drop policy if exists "Authenticated read market cache" on public.market_data_cache;
drop policy if exists "Service role writes market cache" on public.market_data_cache;
create policy "Authenticated read market cache" on public.market_data_cache for select
  using (auth.role() = 'authenticated' and expires_at > now());
create policy "Service role writes market cache" on public.market_data_cache for all using (auth.role() = 'service_role');

-- price alerts
drop policy if exists "price_alerts_manage_own" on public.price_alerts;
drop policy if exists "Users manage own alerts" on public.price_alerts;
create policy "Users manage own alerts" on public.price_alerts for all using (auth.uid() = user_id);

-- deal listings
drop policy if exists "deal_listings_read_authenticated" on public.deal_listings;
drop policy if exists "Authenticated read active listings" on public.deal_listings;
drop policy if exists "Service role manages listings" on public.deal_listings;
create policy "Authenticated read active listings" on public.deal_listings for select
  using (auth.role() = 'authenticated' and is_active = true);
create policy "Service role manages listings" on public.deal_listings for all using (auth.role() = 'service_role');

-- saved deals
drop policy if exists "saved_deals_manage_own" on public.saved_deals;
drop policy if exists "Users manage own saved deals" on public.saved_deals;
create policy "Users manage own saved deals" on public.saved_deals for all using (auth.uid() = user_id);

-- news
drop policy if exists "news_cache_read_authenticated" on public.news_cache;
drop policy if exists "Authenticated read news cache" on public.news_cache;
drop policy if exists "Service role writes news cache" on public.news_cache;
create policy "Authenticated read news cache" on public.news_cache for select using (auth.role() = 'authenticated');
create policy "Service role writes news cache" on public.news_cache for all using (auth.role() = 'service_role');

drop policy if exists "news_relevance_manage_own" on public.news_relevance_scores;
drop policy if exists "Users manage own relevance scores" on public.news_relevance_scores;
create policy "Users manage own relevance scores" on public.news_relevance_scores for all using (auth.uid() = user_id);

drop policy if exists "news_preferences_manage_own" on public.news_preferences;
drop policy if exists "Users manage own news preferences" on public.news_preferences;
create policy "Users manage own news preferences" on public.news_preferences for all using (auth.uid() = user_id);

drop policy if exists "news_saved_manage_own" on public.news_saved;
drop policy if exists "Users manage own saved articles" on public.news_saved;
create policy "Users manage own saved articles" on public.news_saved for all using (auth.uid() = user_id);

-- appraisals
drop policy if exists "appraisals_manage_own" on public.appraisals;
drop policy if exists "Users manage own appraisals" on public.appraisals;
create policy "Users manage own appraisals" on public.appraisals for all using (auth.uid() = user_id);

-- ai usage
drop policy if exists "ai_usage_logs_manage_own" on public.ai_usage_logs;
drop policy if exists "Users read own usage" on public.ai_usage_logs;
drop policy if exists "Service role manages usage" on public.ai_usage_logs;
create policy "Users read own usage" on public.ai_usage_logs for select using (auth.uid() = user_id);
create policy "Service role manages usage" on public.ai_usage_logs for all using (auth.role() = 'service_role');

-- feedback
drop policy if exists "feedback_insert_authenticated" on public.feedback;
drop policy if exists "feedback_select_own" on public.feedback;
drop policy if exists "Users submit feedback" on public.feedback;
drop policy if exists "Service role reads feedback" on public.feedback;
create policy "Users submit feedback" on public.feedback for insert with check (auth.uid() = user_id or user_id is null);
create policy "Service role reads feedback" on public.feedback for select using (auth.role() = 'service_role');
