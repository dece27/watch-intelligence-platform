create index if not exists profiles_public_idx on public.profiles (is_public, created_at desc);
create index if not exists subscriptions_plan_status_idx on public.subscriptions (plan, status);
create index if not exists share_tokens_user_id_idx on public.share_tokens (user_id, created_at desc);
create index if not exists share_tokens_expires_idx on public.share_tokens (expires_at);

create index if not exists watches_user_active_idx on public.watches (user_id, updated_at desc) where deleted_at is null;
create index if not exists watches_user_sold_idx on public.watches (user_id, is_sold, updated_at desc) where deleted_at is null;
create index if not exists watches_reference_idx on public.watches (reference);
create index if not exists watches_brand_reference_idx on public.watches (brand, reference);
create index if not exists watches_brand_trgm_idx on public.watches using gin (brand gin_trgm_ops);
create index if not exists watches_model_trgm_idx on public.watches using gin (model gin_trgm_ops);
create index if not exists watches_reference_trgm_idx on public.watches using gin (reference gin_trgm_ops);

create index if not exists watch_photos_watch_position_idx on public.watch_photos (watch_id, position, created_at);
create index if not exists watch_service_records_watch_date_idx on public.watch_service_records (watch_id, service_date desc);

create index if not exists portfolio_snapshots_user_date_idx on public.portfolio_snapshots (user_id, snapshot_date desc);
create index if not exists market_price_history_lookup_idx on public.market_price_history (brand, reference, recorded_at desc);
create index if not exists market_data_cache_expires_idx on public.market_data_cache (expires_at);
create index if not exists price_alerts_user_active_idx on public.price_alerts (user_id, is_active, created_at desc);
create index if not exists price_alerts_reference_idx on public.price_alerts (brand, reference, is_active);

create index if not exists deal_listings_active_score_idx on public.deal_listings (is_active, deal_score desc, created_at desc);
create index if not exists deal_listings_brand_reference_idx on public.deal_listings (brand, reference, is_active);
create index if not exists saved_deals_user_saved_idx on public.saved_deals (user_id, saved_at desc);

create index if not exists news_relevance_scores_user_score_idx on public.news_relevance_scores (user_id, score desc, scored_at desc);
create index if not exists news_saved_user_saved_idx on public.news_saved (user_id, saved_at desc);
create index if not exists appraisals_user_generated_idx on public.appraisals (user_id, generated_at desc);
create index if not exists ai_usage_logs_user_date_idx on public.ai_usage_logs (user_id, usage_date desc, call_type);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
