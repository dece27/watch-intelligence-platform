create or replace view public.portfolio_snapshot
with (security_invoker = true)
as
select
  w.user_id,
  count(*)::integer as watch_count,
  coalesce(sum(w.purchase_price), 0)::numeric(12, 2) as total_cost,
  coalesce(sum(coalesce(w.current_value, w.purchase_price)), 0)::numeric(12, 2) as total_estimated_value,
  coalesce(
    avg(
      case
        when w.purchase_price > 0 then ((coalesce(w.current_value, w.purchase_price) - w.purchase_price) / w.purchase_price) * 100
        else null
      end
    ),
    0
  )::numeric(8, 2) as average_return_percent,
  max(w.updated_at) as last_updated_at
from public.watches w
group by w.user_id;

create or replace view public.portfolio_brand_allocations
with (security_invoker = true)
as
select
  w.user_id,
  w.brand,
  count(*)::integer as watch_count,
  coalesce(sum(coalesce(w.current_value, w.purchase_price)), 0)::numeric(12, 2) as total_value,
  coalesce(
    round(
      100 * sum(coalesce(w.current_value, w.purchase_price))
      / nullif(sum(sum(coalesce(w.current_value, w.purchase_price))) over (partition by w.user_id), 0),
      2
    ),
    0
  )::numeric(8, 2) as allocation_percent
from public.watches w
group by w.user_id, w.brand;

create or replace view public.latest_market_brand_snapshots
with (security_invoker = true)
as
select brand, snapshot_date, current_index, sentiment_score, price_change_percent, source, metadata, created_at
from (
  select
    m.*, row_number() over (partition by m.brand order by m.snapshot_date desc, m.id desc) as brand_rank
  from public.market_brand_snapshots m
) ranked
where brand_rank = 1;

create or replace view public.active_price_alerts
with (security_invoker = true)
as
select
  pa.id,
  pa.user_id,
  pa.watch_id,
  pa.watch_ref,
  pa.brand,
  pa.model,
  pa.condition,
  pa.target_price,
  pa.created_at,
  pa.updated_at,
  w.current_value,
  w.purchase_price
from public.price_alerts pa
left join public.watches w on w.id = pa.watch_id;
