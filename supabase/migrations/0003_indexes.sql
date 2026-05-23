create index if not exists profiles_email_idx on public.profiles (email);

create index if not exists watches_user_id_idx on public.watches (user_id);
create index if not exists watches_user_id_brand_idx on public.watches (user_id, brand);
create index if not exists watches_user_id_purchase_date_idx on public.watches (user_id, purchase_date desc);
create index if not exists watches_reference_number_idx on public.watches (reference_number);
create index if not exists watches_search_idx
  on public.watches
  using gin (to_tsvector('simple', coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(reference_number, '')));

create index if not exists collection_shares_owner_idx on public.collection_shares (owner_user_id);
create index if not exists collection_shares_active_idx on public.collection_shares (is_active, expires_at);

create index if not exists price_alerts_user_id_idx on public.price_alerts (user_id, created_at desc);
create index if not exists price_alerts_watch_id_idx on public.price_alerts (watch_id);

create index if not exists market_brand_snapshots_brand_date_idx on public.market_brand_snapshots (brand, snapshot_date desc);
create index if not exists auction_results_brand_sale_date_idx on public.auction_results (brand, sale_date desc);
create index if not exists auction_results_reference_number_idx on public.auction_results (reference_number);

create index if not exists deal_matches_user_score_idx on public.deal_matches (user_id, match_score desc, listed_at desc nulls last);
create index if not exists deal_matches_user_created_idx on public.deal_matches (user_id, created_at desc);

create index if not exists news_articles_published_at_idx on public.news_articles (published_at desc);
create index if not exists news_articles_brands_idx on public.news_articles using gin (brands);
create index if not exists news_articles_tags_idx on public.news_articles using gin (tags);

create index if not exists appraisals_user_generated_idx on public.appraisals (user_id, generated_at desc);
create index if not exists appraisals_watch_id_idx on public.appraisals (watch_id, generated_at desc);
create index if not exists ai_usage_last_used_idx on public.ai_usage (last_used_at desc nulls last);
