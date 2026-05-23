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
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, 'Collector'), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set display_name = excluded.display_name,
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
      updated_at = timezone('utc', now());

  insert into public.subscriptions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.news_preferences (user_id)
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
  set display_name = coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name', public.profiles.display_name),
      avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', public.profiles.avatar_url),
      updated_at = timezone('utc', now())
  where id = new.id;

  return new;
end;
$$;

create or replace function public.ensure_single_cover_photo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_cover then
    update public.watch_photos
    set is_cover = false
    where watch_id = new.watch_id
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;

  return new;
end;
$$;

create or replace function public.sync_watch_cover_photo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_watch_id uuid;
  v_cover_url text;
begin
  v_watch_id := coalesce(new.watch_id, old.watch_id);

  select wp.url
  into v_cover_url
  from public.watch_photos wp
  where wp.watch_id = v_watch_id
  order by wp.is_cover desc, wp.position asc, wp.created_at asc
  limit 1;

  update public.watches
  set cover_photo_url = v_cover_url,
      updated_at = timezone('utc', now())
  where id = v_watch_id;

  return coalesce(new, old);
end;
$$;

create or replace function public.create_share_token(
  p_hide_prices boolean default true,
  p_expires_at timestamptz default null
)
returns setof public.share_tokens
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

  return query
  with inserted as (
    insert into public.share_tokens (user_id, hide_prices, expires_at)
    values (v_user_id, coalesce(p_hide_prices, true), p_expires_at)
    returning *
  )
  select * from inserted;
end;
$$;

create or replace function public.get_shared_collection(p_token text)
returns table (
  token text,
  user_id uuid,
  access public.share_access,
  hide_prices boolean,
  display_name text,
  view_count integer,
  last_viewed timestamptz,
  expires_at timestamptz,
  watches jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.share_tokens%rowtype;
begin
  select *
  into v_share
  from public.share_tokens
  where token = p_token
    and (expires_at is null or expires_at > timezone('utc', now()))
  limit 1;

  if not found then
    return;
  end if;

  update public.share_tokens
  set view_count = coalesce(view_count, 0) + 1,
      last_viewed = timezone('utc', now())
  where id = v_share.id
  returning * into v_share;

  return query
  select
    v_share.token,
    v_share.user_id,
    v_share.access,
    v_share.hide_prices,
    p.display_name,
    v_share.view_count,
    v_share.last_viewed,
    v_share.expires_at,
    coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', w.id,
            'brand', w.brand,
            'model', w.model,
            'reference', w.reference,
            'year', w.year,
            'condition', w.condition,
            'hasBox', w.has_box,
            'hasPapers', w.has_papers,
            'coverPhotoUrl', w.cover_photo_url,
            'purchasePrice', case when v_share.hide_prices then null else w.purchase_price end,
            'purchaseCurrency', case when v_share.hide_prices then null else w.purchase_currency end,
            'soldPrice', case when v_share.hide_prices then null else w.sold_price end,
            'isSold', w.is_sold
          )
        )
      ) filter (where w.id is not null),
      '[]'::jsonb
    )
  from public.profiles p
  left join public.watches w
    on w.user_id = v_share.user_id
   and w.deleted_at is null
  where p.id = v_share.user_id
  group by p.display_name, v_share.token, v_share.user_id, v_share.access, v_share.hide_prices, v_share.view_count, v_share.last_viewed, v_share.expires_at;
end;
$$;

create or replace function public.record_ai_usage(
  p_call_type text,
  p_tokens integer default null,
  p_usage_date date default current_date,
  p_increment integer default 1
)
returns setof public.ai_usage_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.ai_usage_logs (
    user_id,
    usage_date,
    call_type,
    call_count,
    tokens_used
  )
  values (
    v_user_id,
    coalesce(p_usage_date, current_date),
    p_call_type,
    greatest(coalesce(p_increment, 1), 0),
    greatest(coalesce(p_tokens, 0), 0)
  )
  on conflict (user_id, usage_date, call_type) do update
  set call_count = public.ai_usage_logs.call_count + greatest(coalesce(p_increment, 1), 0),
      tokens_used = coalesce(public.ai_usage_logs.tokens_used, 0) + greatest(coalesce(p_tokens, 0), 0);

  return query
  select *
  from public.ai_usage_logs
  where user_id = v_user_id
    and usage_date = coalesce(p_usage_date, current_date)
    and call_type = p_call_type;
end;
$$;

create or replace function public.check_and_increment_ai_usage(
  p_user_id uuid,
  p_call_type text,
  p_plan public.subscription_plan
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  daily_limit integer;
  current_count integer;
begin
  daily_limit := case p_plan
    when 'free' then 10
    when 'enthusiast' then 100
    else 99999
  end;

  select coalesce(sum(call_count), 0)
  into current_count
  from public.ai_usage_logs
  where user_id = p_user_id
    and usage_date = current_date;

  if current_count >= daily_limit then
    return false;
  end if;

  insert into public.ai_usage_logs (user_id, usage_date, call_type, call_count)
  values (p_user_id, current_date, p_call_type, 1)
  on conflict (user_id, usage_date, call_type) do update
  set call_count = public.ai_usage_logs.call_count + 1;

  return true;
end;
$$;

create or replace function public.upsert_portfolio_snapshot(
  p_user_id uuid,
  p_total_cost decimal,
  p_total_value decimal,
  p_watch_count smallint,
  p_brand_breakdown jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.portfolio_snapshots (
    user_id,
    snapshot_date,
    total_cost_basis,
    total_market_value,
    watch_count,
    brand_breakdown
  )
  values (
    p_user_id,
    current_date,
    p_total_cost,
    p_total_value,
    p_watch_count,
    p_brand_breakdown
  )
  on conflict (user_id, snapshot_date) do update
  set total_cost_basis = excluded.total_cost_basis,
      total_market_value = excluded.total_market_value,
      watch_count = excluded.watch_count,
      brand_breakdown = excluded.brand_breakdown;
end;
$$;

create or replace function public.soft_delete_watch(p_watch_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.watches
  set deleted_at = timezone('utc', now())
  where id = p_watch_id
    and user_id = p_user_id
    and deleted_at is null;
end;
$$;

create or replace function public.record_share_view(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.share_tokens
  set view_count = coalesce(view_count, 0) + 1,
      last_viewed = timezone('utc', now())
  where token = p_token
    and (expires_at is null or expires_at > timezone('utc', now()));

  return found;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

drop trigger if exists set_watches_updated_at on public.watches;
create trigger set_watches_updated_at
before update on public.watches
for each row execute function public.set_updated_at();

drop trigger if exists set_watch_service_records_updated_at on public.watch_service_records;
create trigger set_watch_service_records_updated_at
before update on public.watch_service_records
for each row execute function public.set_updated_at();

drop trigger if exists set_price_alerts_updated_at on public.price_alerts;
create trigger set_price_alerts_updated_at
before update on public.price_alerts
for each row execute function public.set_updated_at();

drop trigger if exists set_deal_listings_updated_at on public.deal_listings;
create trigger set_deal_listings_updated_at
before update on public.deal_listings
for each row execute function public.set_updated_at();

drop trigger if exists set_news_preferences_updated_at on public.news_preferences;
create trigger set_news_preferences_updated_at
before update on public.news_preferences
for each row execute function public.set_updated_at();

drop trigger if exists before_watch_photo_cover on public.watch_photos;
create trigger before_watch_photo_cover
before insert or update on public.watch_photos
for each row execute function public.ensure_single_cover_photo();

drop trigger if exists after_watch_photo_cover on public.watch_photos;
create trigger after_watch_photo_cover
after insert or update or delete on public.watch_photos
for each row execute function public.sync_watch_cover_photo();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of raw_user_meta_data on auth.users
for each row execute function public.sync_profile_from_auth_user();

grant execute on function public.create_share_token(boolean, timestamptz) to authenticated;
grant execute on function public.get_shared_collection(text) to anon, authenticated;
grant execute on function public.record_ai_usage(text, integer, date, integer) to authenticated;
grant execute on function public.check_and_increment_ai_usage(uuid, text, public.subscription_plan) to authenticated;
grant execute on function public.upsert_portfolio_snapshot(uuid, decimal, decimal, smallint, jsonb) to authenticated;
grant execute on function public.soft_delete_watch(uuid, uuid) to authenticated;
grant execute on function public.record_share_view(text) to anon, authenticated;
