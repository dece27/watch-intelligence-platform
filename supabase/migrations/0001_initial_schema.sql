create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.watch_condition as enum ('mint', 'excellent', 'good', 'fair');
create type public.watch_category as enum ('dress', 'sport', 'dive', 'pilot', 'chronograph', 'complications');
create type public.alert_condition as enum ('above', 'below');

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,
  name text not null,
  vault_name text not null default 'WatchVault',
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  deals jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  brand text not null,
  model text not null,
  reference_number text,
  serial_number text,
  year integer check (year is null or (year between 1800 and extract(year from timezone('utc', now()))::integer + 1)),
  purchase_price numeric(12, 2) not null check (purchase_price >= 0),
  purchase_date date not null,
  current_value numeric(12, 2) check (current_value is null or current_value >= 0),
  condition public.watch_condition not null,
  category public.watch_category not null,
  image_path text,
  movement text,
  case_material text,
  case_diameter text,
  notes text,
  has_box boolean not null default false,
  has_papers boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.collection_shares (
  slug text primary key check (slug ~ '^[a-zA-Z0-9_-]{8,128}$'),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  owner_vault_name text not null,
  watches_snapshot jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  watch_id uuid references public.watches (id) on delete cascade,
  watch_ref text not null,
  brand text not null,
  model text not null,
  condition public.alert_condition not null,
  target_price numeric(12, 2) not null check (target_price > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.market_brand_snapshots (
  id bigint generated always as identity primary key,
  brand text not null,
  snapshot_date date not null,
  current_index numeric(10, 2) not null check (current_index >= 0),
  sentiment_score numeric(5, 2) not null,
  price_change_percent numeric(6, 2),
  source text not null default 'internal',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (brand, snapshot_date)
);

create table if not exists public.auction_results (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  reference_number text,
  sale_date date not null,
  sale_price numeric(12, 2) not null check (sale_price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  auction_house text not null,
  location text,
  lot_number text,
  result_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.deal_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  external_id text not null,
  brand text not null,
  model text not null,
  reference_number text,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  market_value numeric(12, 2),
  fair_value numeric(12, 2),
  discount numeric(6, 2) not null default 0,
  condition text not null,
  seller text not null,
  location text not null,
  source text not null default 'chrono24',
  source_url text,
  listed_at timestamptz,
  ai_reasoning text,
  image_url text,
  match_score numeric(5, 2) not null default 0,
  deal_score numeric(5, 2),
  days_listed integer,
  seller_rating numeric(3, 2),
  has_box boolean not null default false,
  has_papers boolean not null default false,
  year integer check (year is null or (year between 1800 and extract(year from timezone('utc', now()))::integer + 1)),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, source, external_id)
);

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  url text not null unique,
  image_url text,
  source text not null,
  source_icon text not null,
  published_at timestamptz not null,
  brands text[] not null default '{}',
  tags text[] not null default '{}',
  canonical_score numeric(5, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_news_feed_cache (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  articles jsonb not null default '[]'::jsonb,
  dependency_hash text not null,
  cached_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.appraisals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  watch_id uuid not null references public.watches (id) on delete cascade,
  appraised_value numeric(12, 2) not null check (appraised_value >= 0),
  replacement_value numeric(12, 2) check (replacement_value is null or replacement_value >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  appraisal_text text,
  appraisal_payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_usage (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  ai_tokens_used bigint not null default 0 check (ai_tokens_used >= 0),
  ai_requests_count integer not null default 0 check (ai_requests_count >= 0),
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
