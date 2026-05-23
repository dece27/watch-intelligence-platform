begin;

select plan(10);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-4444-444444444441',
    'authenticated',
    'authenticated',
    'usage-ok@example.com',
    crypt('password', gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Usage OK"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-4444-444444444442',
    'authenticated',
    'authenticated',
    'usage-limit@example.com',
    crypt('password', gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Usage Limit"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-4444-444444444443',
    'authenticated',
    'authenticated',
    'portfolio@example.com',
    crypt('password', gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Portfolio User"}',
    timezone('utc', now()),
    timezone('utc', now())
  )
on conflict (id) do nothing;

insert into public.ai_usage_logs (user_id, usage_date, call_type, call_count)
values
  ('44444444-4444-4444-4444-444444444441', current_date, 'signal', 9),
  ('44444444-4444-4444-4444-444444444442', current_date, 'signal', 10)
on conflict (user_id, usage_date, call_type) do update
set call_count = excluded.call_count;

select ok(
  public.check_and_increment_ai_usage('44444444-4444-4444-4444-444444444441', 'signal', 'free'),
  'check_and_increment_ai_usage returns TRUE under the free-plan limit'
);

select is(
  (select sum(call_count)::integer from public.ai_usage_logs where user_id = '44444444-4444-4444-4444-444444444441' and usage_date = current_date),
  10,
  'check_and_increment_ai_usage increments usage when under the limit'
);

select ok(
  not public.check_and_increment_ai_usage('44444444-4444-4444-4444-444444444442', 'signal', 'free'),
  'check_and_increment_ai_usage returns FALSE at the free-plan limit'
);

select is(
  (select sum(call_count)::integer from public.ai_usage_logs where user_id = '44444444-4444-4444-4444-444444444442' and usage_date = current_date),
  10,
  'check_and_increment_ai_usage does not increment usage at the limit'
);

select public.upsert_portfolio_snapshot(
  '44444444-4444-4444-4444-444444444443',
  10000,
  12000,
  1,
  '{"Rolex":1}'::jsonb
);

select is(
  (select count(*)::integer from public.portfolio_snapshots where user_id = '44444444-4444-4444-4444-444444444443' and snapshot_date = current_date),
  1,
  'upsert_portfolio_snapshot inserts the first snapshot for the day'
);

select public.upsert_portfolio_snapshot(
  '44444444-4444-4444-4444-444444444443',
  10500,
  12500,
  2,
  '{"Rolex":1,"Omega":1}'::jsonb
);

select ok(
  exists(
    select 1
    from public.portfolio_snapshots
    where user_id = '44444444-4444-4444-4444-444444444443'
      and snapshot_date = current_date
      and total_market_value = 12500
      and watch_count = 2
  )
  and (select count(*)::integer from public.portfolio_snapshots where user_id = '44444444-4444-4444-4444-444444444443' and snapshot_date = current_date) = 1,
  'upsert_portfolio_snapshot updates the existing daily snapshot instead of inserting a duplicate'
);

insert into public.share_tokens (id, user_id, token, view_count)
values ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444443', 'portfolio-share-token', 2)
on conflict (id) do nothing;

select ok(
  public.record_share_view('portfolio-share-token'),
  'record_share_view returns TRUE for a valid token'
);

select ok(
  exists(
    select 1
    from public.share_tokens
    where token = 'portfolio-share-token'
      and view_count = 3
      and last_viewed is not null
  ),
  'record_share_view increments view_count and sets last_viewed'
);

insert into public.portfolio_snapshots (user_id, snapshot_date, total_cost_basis, total_market_value, watch_count, brand_breakdown)
values
  ('44444444-4444-4444-4444-444444444443', current_date - 10, 8000, 9000, 1, '{"Rolex":1}'::jsonb),
  ('44444444-4444-4444-4444-444444444443', current_date - 1, 10300, 12300, 2, '{"Rolex":1,"Omega":1}'::jsonb)
on conflict (user_id, snapshot_date) do update
set total_cost_basis = excluded.total_cost_basis,
    total_market_value = excluded.total_market_value,
    watch_count = excluded.watch_count,
    brand_breakdown = excluded.brand_breakdown;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444443', true);

select is(
  (select count(*)::integer from public.get_portfolio_trend(2)),
  2,
  'get_portfolio_trend returns only rows inside the requested date range'
);

select is(
  (
    select array_agg(snapshot_date order by snapshot_date)::text
    from public.get_portfolio_trend(2)
  ),
  format('{%s,%s}', current_date - 1, current_date),
  'get_portfolio_trend returns the expected ordered date range'
);

select * from finish();
rollback;
