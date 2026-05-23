create or replace view public.portfolio_snapshot
with (security_invoker = true)
as
select
  ranked.user_id,
  ranked.snapshot_date,
  ranked.total_cost_basis,
  ranked.total_market_value,
  ranked.watch_count,
  ranked.brand_breakdown,
  case
    when ranked.total_cost_basis > 0 then round(((ranked.total_market_value - ranked.total_cost_basis) / ranked.total_cost_basis) * 100, 2)
    else 0
  end as return_percent,
  ranked.created_at
from (
  select
    ps.*,
    row_number() over (partition by ps.user_id order by ps.snapshot_date desc, ps.created_at desc) as snapshot_rank
  from public.portfolio_snapshots ps
) ranked
where ranked.snapshot_rank = 1;

create or replace view public.portfolio_brand_allocations
with (security_invoker = true)
as
select
  w.user_id,
  w.brand,
  count(*)::integer as watch_count,
  coalesce(sum(coalesce(w.purchase_price, 0)), 0)::numeric(14, 2) as total_value,
  coalesce(
    round(
      100 * sum(coalesce(w.purchase_price, 0))
      / nullif(sum(sum(coalesce(w.purchase_price, 0))) over (partition by w.user_id), 0),
      2
    ),
    0
  )::numeric(8, 2) as allocation_percent
from public.watches w
where w.deleted_at is null
group by w.user_id, w.brand;

create or replace view public.latest_market_prices
with (security_invoker = true)
as
select
  ranked.brand,
  ranked.reference,
  ranked.price_usd,
  ranked.source,
  ranked.condition,
  ranked.recorded_at
from (
  select
    mph.*,
    row_number() over (partition by mph.brand, mph.reference order by mph.recorded_at desc, mph.id desc) as price_rank
  from public.market_price_history mph
) ranked
where ranked.price_rank = 1;

create or replace view public.active_price_alerts
with (security_invoker = true)
as
select
  pa.id,
  pa.user_id,
  pa.brand,
  pa.reference,
  pa.direction,
  pa.target_price,
  pa.currency,
  pa.is_active,
  pa.last_checked,
  pa.triggered_at,
  pa.trigger_price,
  pa.notified_at,
  pa.created_at,
  pa.updated_at,
  lmp.price_usd as current_price_usd,
  lmp.recorded_at as market_recorded_at
from public.price_alerts pa
left join public.latest_market_prices lmp
  on lmp.brand = pa.brand
 and lmp.reference = pa.reference
where pa.is_active = true;

create or replace view public.v_collection_summary
with (security_invoker = true)
as
select
  w.user_id,
  count(*) filter (where w.is_sold = false)::integer as active_count,
  count(*) filter (where w.is_sold = true)::integer as sold_count,
  sum(w.purchase_price) filter (where w.is_sold = false) as total_cost_basis,
  count(distinct w.brand)::integer as brand_count,
  count(*) filter (where w.has_box and w.has_papers)::integer as full_set_count,
  min(w.purchase_date) as earliest_purchase,
  max(w.purchase_date) as latest_purchase
from public.watches w
where w.deleted_at is null
group by w.user_id;

create or replace function public.get_my_collection_summary()
returns setof public.v_collection_summary
language sql
security definer
set search_path = public
as $$
  select *
  from public.v_collection_summary
  where user_id = auth.uid();
$$;

create or replace function public.get_portfolio_trend(p_days integer default 365)
returns table (
  snapshot_date date,
  total_market_value decimal,
  total_cost_basis decimal
)
language sql
security definer
set search_path = public
as $$
  select
    ps.snapshot_date,
    ps.total_market_value,
    ps.total_cost_basis
  from public.portfolio_snapshots ps
  where ps.user_id = auth.uid()
    and ps.snapshot_date >= current_date - greatest(coalesce(p_days, 365), 0)
  order by ps.snapshot_date asc;
$$;

grant execute on function public.get_my_collection_summary() to authenticated;
grant execute on function public.get_portfolio_trend(integer) to authenticated;
