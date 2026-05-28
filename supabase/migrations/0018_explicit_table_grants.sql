-- =============================================================
-- Migration 0018: Explicit table grants (Supabase Data API hardening)
--
-- Background: Starting May 30 2026 (new projects) and October 30 2026
-- (all existing projects), tables in the public schema are no longer
-- automatically exposed to the Data API. This migration makes all
-- role→table grants explicit so the project is safe before that deadline.
--
-- Reference: https://github.com/orgs/supabase/discussions/45329
-- =============================================================

-- ----------------------------------------------------------------
-- 1. Opt into the new default-privileges behaviour immediately.
--    This only affects FUTURE tables created by the postgres role.
--    Existing tables keep their current (implicit) grants, so the
--    running application stays fully reachable.
-- ----------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

-- ----------------------------------------------------------------
-- 2. Explicit grants for every existing table.
--    Permissions are derived from the RLS policies in 0002 and later
--    migrations. service_role always receives ALL so background workers
--    and Edge Functions can manage data without row-level filtering.
-- ----------------------------------------------------------------

-- profiles
-- authenticated: SELECT (own row + public profiles), INSERT (own), UPDATE (own)
-- service_role:  ALL
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- subscriptions
-- authenticated: SELECT (own row only, enforced by RLS)
-- service_role:  ALL (manages all subscription state)
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

-- user_preferences
-- authenticated: ALL (own row)
-- service_role:  ALL
grant select, insert, update, delete on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;

-- share_tokens
-- anon:          SELECT (needed for "Public read valid token" policy used in
--                        share-token validation by unauthenticated viewers)
-- authenticated: ALL (manage own tokens)
-- service_role:  ALL
grant select on public.share_tokens to anon;
grant select, insert, update, delete on public.share_tokens to authenticated;
grant all on public.share_tokens to service_role;

-- watches
-- authenticated: ALL (own watches + shared-collection reads via RLS)
-- service_role:  ALL
grant select, insert, update, delete on public.watches to authenticated;
grant all on public.watches to service_role;

-- watch_photos
-- authenticated: ALL (own photos)
-- service_role:  ALL
grant select, insert, update, delete on public.watch_photos to authenticated;
grant all on public.watch_photos to service_role;

-- watch_service_records
-- authenticated: ALL (own records)
-- service_role:  ALL
grant select, insert, update, delete on public.watch_service_records to authenticated;
grant all on public.watch_service_records to service_role;

-- portfolio_snapshots
-- authenticated: SELECT (own), INSERT (own or via service_role RLS bypass)
-- service_role:  ALL
grant select, insert on public.portfolio_snapshots to authenticated;
grant all on public.portfolio_snapshots to service_role;

-- market_price_history
-- authenticated: SELECT
-- service_role:  ALL (writes market data)
grant select on public.market_price_history to authenticated;
grant all on public.market_price_history to service_role;

-- market_data_cache
-- authenticated: SELECT (non-expired entries, enforced by RLS)
-- service_role:  ALL
grant select on public.market_data_cache to authenticated;
grant all on public.market_data_cache to service_role;

-- price_alerts
-- authenticated: ALL (own alerts)
-- service_role:  ALL
grant select, insert, update, delete on public.price_alerts to authenticated;
grant all on public.price_alerts to service_role;

-- deal_listings
-- anon:          SELECT (active listings readable without login, per migration 0008)
-- authenticated: SELECT
-- service_role:  ALL (Chrono24 sync worker writes listings)
grant select on public.deal_listings to anon;
grant select on public.deal_listings to authenticated;
grant all on public.deal_listings to service_role;

-- saved_deals
-- authenticated: ALL (own saved deals)
-- service_role:  ALL
grant select, insert, update, delete on public.saved_deals to authenticated;
grant all on public.saved_deals to service_role;

-- news_cache
-- authenticated: SELECT (shared news feed)
-- service_role:  ALL (news fetcher writes cache)
grant select on public.news_cache to authenticated;
grant all on public.news_cache to service_role;

-- news_relevance_scores
-- authenticated: ALL (own scores)
-- service_role:  ALL
grant select, insert, update, delete on public.news_relevance_scores to authenticated;
grant all on public.news_relevance_scores to service_role;

-- news_preferences
-- authenticated: ALL (own preferences)
-- service_role:  ALL
grant select, insert, update, delete on public.news_preferences to authenticated;
grant all on public.news_preferences to service_role;

-- news_saved
-- authenticated: ALL (own saved articles)
-- service_role:  ALL
grant select, insert, update, delete on public.news_saved to authenticated;
grant all on public.news_saved to service_role;

-- appraisals
-- authenticated: ALL (own appraisals)
-- service_role:  ALL
grant select, insert, update, delete on public.appraisals to authenticated;
grant all on public.appraisals to service_role;

-- ai_usage_logs
-- authenticated: SELECT (read own usage via RLS; writes go through the
--                        record_ai_usage SECURITY DEFINER RPC)
-- service_role:  ALL
grant select on public.ai_usage_logs to authenticated;
grant all on public.ai_usage_logs to service_role;

-- feedback
-- anon:          INSERT (user_id may be null for anonymous submissions per RLS)
-- authenticated: INSERT (own feedback; no SELECT needed by regular users)
-- service_role:  ALL (reads feedback in admin tools)
grant insert on public.feedback to anon;
grant insert on public.feedback to authenticated;
grant all on public.feedback to service_role;

-- sync_runs / sync_health
-- anon and authenticated were already explicitly revoked in migration 0013.
-- Add service_role ALL explicitly to be declarative.
grant all on public.sync_runs to service_role;
grant all on public.sync_health to service_role;
