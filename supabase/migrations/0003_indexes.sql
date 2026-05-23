drop index if exists public.profiles_public_idx;
drop index if exists public.subscriptions_plan_status_idx;
drop index if exists public.share_tokens_user_id_idx;
drop index if exists public.share_tokens_expires_idx;
drop index if exists public.watches_user_active_idx;
drop index if exists public.watches_user_sold_idx;
drop index if exists public.watches_reference_idx;
drop index if exists public.watches_brand_reference_idx;
drop index if exists public.watches_brand_trgm_idx;
drop index if exists public.watches_model_trgm_idx;
drop index if exists public.watches_reference_trgm_idx;
drop index if exists public.watch_photos_watch_position_idx;
drop index if exists public.watch_service_records_watch_date_idx;
drop index if exists public.portfolio_snapshots_user_date_idx;
drop index if exists public.market_price_history_lookup_idx;
drop index if exists public.market_data_cache_expires_idx;
drop index if exists public.price_alerts_user_active_idx;
drop index if exists public.price_alerts_reference_idx;
drop index if exists public.deal_listings_active_score_idx;
drop index if exists public.deal_listings_brand_reference_idx;
drop index if exists public.saved_deals_user_saved_idx;
drop index if exists public.news_relevance_scores_user_score_idx;
drop index if exists public.news_saved_user_saved_idx;
drop index if exists public.appraisals_user_generated_idx;
drop index if exists public.ai_usage_logs_user_date_idx;
drop index if exists public.feedback_created_idx;

drop index if exists public.idx_watches_user_id;
drop index if exists public.idx_watches_brand;
drop index if exists public.idx_watches_reference;
drop index if exists public.idx_watches_user_brand;
drop index if exists public.idx_watches_search;
drop index if exists public.idx_watches_brand_trgm;
drop index if exists public.idx_watches_reference_trgm;
drop index if exists public.idx_watch_photos_watch_id;
drop index if exists public.idx_watch_photos_cover;
drop index if exists public.idx_snapshots_user_date;
drop index if exists public.idx_market_brand_ref_date;
drop index if exists public.idx_market_recorded_at;
drop index if exists public.idx_market_cache_key;
drop index if exists public.idx_market_cache_expires;
drop index if exists public.idx_alerts_user_active;
drop index if exists public.idx_alerts_brand_ref;
drop index if exists public.idx_deals_active_score;
drop index if exists public.idx_deals_brand;
drop index if exists public.idx_deals_price_range;
drop index if exists public.idx_saved_deals_user;
drop index if exists public.idx_news_scores_user;
drop index if exists public.idx_news_scores_article;
drop index if exists public.idx_news_saved_user;
drop index if exists public.idx_ai_usage_user_date;
drop index if exists public.idx_subscriptions_plan;

create index if not exists idx_watches_user_id on public.watches (user_id) where deleted_at is null;
create index if not exists idx_watches_brand on public.watches (brand) where deleted_at is null;
create index if not exists idx_watches_reference on public.watches (reference) where deleted_at is null;
create index if not exists idx_watches_user_brand on public.watches (user_id, brand) where deleted_at is null;
create index if not exists idx_watches_search on public.watches
  using gin (to_tsvector('english', brand || ' ' || coalesce(model, '') || ' ' || reference))
  where deleted_at is null;
create index if not exists idx_watches_brand_trgm on public.watches using gin (brand gin_trgm_ops);
create index if not exists idx_watches_reference_trgm on public.watches using gin (reference gin_trgm_ops);

create index if not exists idx_watch_photos_watch_id on public.watch_photos (watch_id);
create index if not exists idx_watch_photos_cover on public.watch_photos (watch_id) where is_cover = true;

create index if not exists idx_snapshots_user_date on public.portfolio_snapshots (user_id, snapshot_date desc);

create index if not exists idx_market_brand_ref_date on public.market_price_history (brand, reference, recorded_at desc);
create index if not exists idx_market_recorded_at on public.market_price_history (recorded_at desc);

create index if not exists idx_market_cache_key on public.market_data_cache (cache_key);
create index if not exists idx_market_cache_expires on public.market_data_cache (expires_at);

create index if not exists idx_alerts_user_active on public.price_alerts (user_id) where is_active = true;
create index if not exists idx_alerts_brand_ref on public.price_alerts (brand, reference) where is_active = true;

create index if not exists idx_deals_active_score on public.deal_listings (deal_score desc) where is_active = true;
create index if not exists idx_deals_brand on public.deal_listings (brand) where is_active = true;
create index if not exists idx_deals_price_range on public.deal_listings (asking_price) where is_active = true;

create index if not exists idx_saved_deals_user on public.saved_deals (user_id, saved_at desc);

create index if not exists idx_news_scores_user on public.news_relevance_scores (user_id, score desc);
create index if not exists idx_news_scores_article on public.news_relevance_scores (article_id);
create index if not exists idx_news_saved_user on public.news_saved (user_id, saved_at desc);

create index if not exists idx_ai_usage_user_date on public.ai_usage_logs (user_id, usage_date);

create index if not exists idx_subscriptions_plan on public.subscriptions (plan) where status = 'active';
