create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";
create extension if not exists pgcrypto;

create type public.watch_condition as enum (
  'Unworn', 'Mint', 'Excellent', 'Very Good', 'Good', 'Fair'
);
create type public.subscription_plan as enum (
  'free', 'enthusiast', 'investor', 'enterprise'
);
create type public.subscription_status as enum (
  'active', 'trialing', 'past_due', 'canceled', 'paused'
);
create type public.alert_direction as enum ('above', 'below');
create type public.appraisal_purpose as enum (
  'insurance', 'estate', 'collateral', 'personal'
);
create type public.news_sort_mode as enum ('recent', 'relevant');
create type public.share_access as enum ('read_only');

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text check (char_length(bio) <= 500),
  location text,
  is_public boolean default false,
  collector_since integer check (
    collector_since >= 1900
    and collector_since <= extract(year from timezone('utc', now()))
  ),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete cascade unique not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan public.subscription_plan default 'free' not null,
  status public.subscription_status default 'active' not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  trial_end timestamptz,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.user_preferences (
  user_id uuid references auth.users (id) on delete cascade primary key,
  currency text default 'USD' check (currency in ('USD','EUR','GBP','CHF','JPY','SGD','HKD')),
  locale text default 'en',
  theme text default 'dark' check (theme in ('dark','light')),
  show_purchase_prices boolean default true,
  email_price_alerts boolean default true,
  email_weekly_digest boolean default false,
  default_portfolio_view text default 'value' check (default_portfolio_view in ('value','roi','brand','timeline')),
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.share_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  token text unique not null default (
    replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '')
  ),
  access public.share_access default 'read_only' not null,
  hide_prices boolean default true,
  view_count integer default 0,
  last_viewed timestamptz,
  expires_at timestamptz,
  created_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.watches (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  brand text not null check (char_length(brand) <= 100),
  model text check (char_length(model) <= 200),
  reference text not null check (char_length(reference) <= 100),
  year integer check (
    year >= 1800
    and year <= extract(year from timezone('utc', now())) + 1
  ),
  condition public.watch_condition,
  has_box boolean default false not null,
  has_papers boolean default false not null,
  purchase_price decimal(14, 2) check (purchase_price >= 0),
  purchase_date date,
  purchase_currency text default 'USD',
  serial_number text check (char_length(serial_number) <= 50),
  notes text check (char_length(notes) <= 2000),
  cover_photo_url text,
  is_sold boolean default false not null,
  sold_price decimal(14, 2) check (sold_price >= 0),
  sold_date date,
  deleted_at timestamptz,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null,
  constraint sold_consistency check (
    (is_sold = false and sold_price is null and sold_date is null)
    or (is_sold = true and sold_price is not null)
  )
);

create table if not exists public.watch_photos (
  id uuid default gen_random_uuid() primary key,
  watch_id uuid references public.watches (id) on delete cascade not null,
  user_id uuid references auth.users (id) on delete cascade not null,
  storage_path text not null,
  url text not null,
  is_cover boolean default false,
  position smallint default 0,
  width integer,
  height integer,
  size_bytes integer,
  created_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.watch_service_records (
  id uuid default gen_random_uuid() primary key,
  watch_id uuid references public.watches (id) on delete cascade not null,
  user_id uuid references auth.users (id) on delete cascade not null,
  service_date date not null,
  service_type text not null check (char_length(service_type) <= 200),
  watchmaker text check (char_length(watchmaker) <= 200),
  location text check (char_length(location) <= 200),
  cost decimal(10, 2) check (cost >= 0),
  currency text default 'USD',
  notes text check (char_length(notes) <= 2000),
  warranty_until date,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.portfolio_snapshots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  snapshot_date date not null,
  total_cost_basis decimal(14, 2) not null,
  total_market_value decimal(14, 2) not null,
  watch_count smallint not null,
  brand_breakdown jsonb,
  created_at timestamptz default timezone('utc', now()) not null,
  unique (user_id, snapshot_date)
);

create table if not exists public.market_price_history (
  id uuid default gen_random_uuid() primary key,
  brand text not null,
  reference text not null,
  price_usd decimal(14, 2) not null,
  source text not null,
  condition text,
  recorded_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.market_data_cache (
  id uuid default gen_random_uuid() primary key,
  cache_key text unique not null,
  data jsonb not null,
  source text,
  computed_at timestamptz default timezone('utc', now()) not null,
  expires_at timestamptz not null
);

create table if not exists public.price_alerts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  brand text not null,
  reference text not null,
  direction public.alert_direction not null,
  target_price decimal(14, 2) not null check (target_price > 0),
  currency text default 'USD',
  is_active boolean default true not null,
  last_checked timestamptz,
  triggered_at timestamptz,
  trigger_price decimal(14, 2),
  notified_at timestamptz,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.deal_listings (
  id uuid default gen_random_uuid() primary key,
  brand text not null,
  model text,
  reference text not null,
  year integer,
  condition public.watch_condition,
  asking_price decimal(14, 2) not null,
  fair_value decimal(14, 2) not null,
  currency text default 'USD',
  seller_rating decimal(2, 1) check (seller_rating >= 1 and seller_rating <= 5),
  days_listed smallint default 0,
  location text,
  has_box boolean default false,
  has_papers boolean default false,
  source text default 'mock',
  external_url text,
  photo_url text,
  deal_score smallint generated always as (
    greatest(0, least(100,
      round(
        100 - (asking_price / nullif(fair_value, 0) * 100)
        + (coalesce(seller_rating, 3) * 5)
        - (coalesce(days_listed, 0) * 0.5)
      )::integer
    ))
  ) stored,
  is_active boolean default true,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.saved_deals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  listing_id uuid references public.deal_listings (id) on delete set null,
  listing_snapshot jsonb not null,
  saved_at timestamptz default timezone('utc', now()) not null,
  unique (user_id, listing_id)
);

create table if not exists public.news_cache (
  id uuid default gen_random_uuid() primary key,
  cache_key text unique not null default 'feed_all',
  articles jsonb not null,
  article_count integer generated always as (jsonb_array_length(articles)) stored,
  cached_at timestamptz default timezone('utc', now()) not null,
  expires_at timestamptz generated always as (cached_at + interval '30 minutes') stored
);

create table if not exists public.news_relevance_scores (
  id uuid default gen_random_uuid() primary key,
  article_id text not null,
  user_id uuid references auth.users (id) on delete cascade not null,
  score smallint check (score >= 0 and score <= 100),
  reason text check (char_length(reason) <= 200),
  scored_at timestamptz default timezone('utc', now()) not null,
  unique (article_id, user_id)
);

create table if not exists public.news_preferences (
  user_id uuid references auth.users (id) on delete cascade primary key,
  enabled_sources text[] default array[
    'hodinkee','fratello','monochrome','wornandwound','watchpro',
    'sjx','ablogtowatch','timeandtide','deployant','watchtime',
    'hautetime','crownandcaliber','thetimebum','oracletime',
    'quillandpad','horologium','watchcrunch'
  ],
  muted_sources text[] default '{}',
  preferred_tags text[] default '{}',
  sort_mode public.news_sort_mode default 'relevant',
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.news_saved (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  article_id text not null,
  article jsonb not null,
  saved_at timestamptz default timezone('utc', now()) not null,
  unique (user_id, article_id)
);

create table if not exists public.appraisals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  watch_ids uuid[] not null,
  purpose public.appraisal_purpose not null,
  appraiser_name text,
  pdf_url text,
  storage_path text,
  total_value decimal(14, 2),
  currency text default 'USD',
  report_data jsonb,
  generated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.ai_usage_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  usage_date date default current_date not null,
  call_type text not null check (call_type in (
    'signal','chat','identifier','deal_assessment',
    'appraisal_text','news_relevance','rebalancing'
  )),
  call_count integer default 1 not null,
  tokens_used integer,
  created_at timestamptz default timezone('utc', now()) not null,
  unique (user_id, usage_date, call_type)
);

create table if not exists public.feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete set null,
  message text not null check (char_length(message) <= 2000),
  rating smallint check (rating >= 1 and rating <= 5),
  category text check (category in ('bug','feature','ux','data','other')),
  page_context text,
  user_agent text,
  created_at timestamptz default timezone('utc', now()) not null
);
