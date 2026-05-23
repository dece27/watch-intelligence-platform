create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, vault_name)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@watchvault.local'),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, 'Collector'), '@', 1), 'Collector'),
    coalesce(new.raw_user_meta_data ->> 'vault_name', 'WatchVault')
  )
  on conflict (id) do update
  set email = excluded.email,
      name = excluded.name,
      vault_name = excluded.vault_name,
      updated_at = timezone('utc', now());

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.ai_usage (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = coalesce(new.email, profiles.email),
      name = coalesce(new.raw_user_meta_data ->> 'name', profiles.name),
      vault_name = coalesce(new.raw_user_meta_data ->> 'vault_name', profiles.vault_name),
      updated_at = timezone('utc', now())
  where id = new.id;

  return new;
end;
$$;

create or replace function public.save_collection_share(
  p_slug text,
  p_watches_snapshot jsonb,
  p_expires_at timestamptz default null
)
returns setof public.collection_shares
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_vault_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select vault_name into v_vault_name
  from public.profiles
  where id = v_user_id;

  if v_vault_name is null then
    raise exception 'Profile not found';
  end if;

  insert into public.collection_shares (
    slug,
    owner_user_id,
    owner_vault_name,
    watches_snapshot,
    expires_at,
    is_active
  )
  values (
    p_slug,
    v_user_id,
    v_vault_name,
    coalesce(p_watches_snapshot, '[]'::jsonb),
    p_expires_at,
    true
  )
  on conflict (slug) do update
  set owner_user_id = excluded.owner_user_id,
      owner_vault_name = excluded.owner_vault_name,
      watches_snapshot = excluded.watches_snapshot,
      expires_at = excluded.expires_at,
      is_active = true,
      updated_at = timezone('utc', now());

  return query
  select *
  from public.collection_shares
  where slug = p_slug;
end;
$$;

create or replace function public.get_shared_collection(p_slug text)
returns table (
  slug text,
  owner_user_id uuid,
  owner_vault_name text,
  watches_snapshot jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    cs.slug,
    cs.owner_user_id,
    cs.owner_vault_name,
    cs.watches_snapshot,
    cs.created_at,
    cs.updated_at,
    cs.expires_at
  from public.collection_shares cs
  where cs.slug = p_slug
    and cs.is_active = true
    and (cs.expires_at is null or cs.expires_at > timezone('utc', now()))
  limit 1;
$$;

create or replace function public.record_ai_usage(
  p_tokens bigint,
  p_requests integer default 1
)
returns setof public.ai_usage
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.ai_usage (
    user_id,
    ai_tokens_used,
    ai_requests_count,
    last_used_at
  )
  values (
    v_user_id,
    greatest(coalesce(p_tokens, 0), 0),
    greatest(coalesce(p_requests, 1), 0),
    timezone('utc', now())
  )
  on conflict (user_id) do update
  set ai_tokens_used = public.ai_usage.ai_tokens_used + greatest(coalesce(p_tokens, 0), 0),
      ai_requests_count = public.ai_usage.ai_requests_count + greatest(coalesce(p_requests, 1), 0),
      last_used_at = timezone('utc', now()),
      updated_at = timezone('utc', now());

  return query
  select *
  from public.ai_usage
  where user_id = v_user_id;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

drop trigger if exists set_watches_updated_at on public.watches;
create trigger set_watches_updated_at
before update on public.watches
for each row execute function public.set_updated_at();

drop trigger if exists set_collection_shares_updated_at on public.collection_shares;
create trigger set_collection_shares_updated_at
before update on public.collection_shares
for each row execute function public.set_updated_at();

drop trigger if exists set_price_alerts_updated_at on public.price_alerts;
create trigger set_price_alerts_updated_at
before update on public.price_alerts
for each row execute function public.set_updated_at();

drop trigger if exists set_deal_matches_updated_at on public.deal_matches;
create trigger set_deal_matches_updated_at
before update on public.deal_matches
for each row execute function public.set_updated_at();

drop trigger if exists set_user_news_feed_cache_updated_at on public.user_news_feed_cache;
create trigger set_user_news_feed_cache_updated_at
before update on public.user_news_feed_cache
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_usage_updated_at on public.ai_usage;
create trigger set_ai_usage_updated_at
before update on public.ai_usage
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_from_auth_user();

grant execute on function public.save_collection_share(text, jsonb, timestamptz) to authenticated;
grant execute on function public.get_shared_collection(text) to anon, authenticated;
grant execute on function public.record_ai_usage(bigint, integer) to authenticated;
