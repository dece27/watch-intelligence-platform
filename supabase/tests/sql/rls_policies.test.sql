begin;

select plan(6);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.profiles (id, email, name, vault_name)
values
  ('11111111-1111-1111-1111-111111111111', 'collector-a@example.com', 'Collector A', 'Vault A'),
  ('22222222-2222-2222-2222-222222222222', 'collector-b@example.com', 'Collector B', 'Vault B')
on conflict (id) do nothing;

insert into public.watches (id, user_id, brand, model, purchase_price, purchase_date, condition, category)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Rolex', 'Submariner', 10000, current_date, 'excellent', 'sport'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Omega', 'Speedmaster', 7000, current_date, 'good', 'chronograph')
on conflict (id) do nothing;

select is(
  (select count(*)::integer from public.watches),
  1,
  'authenticated users only see their own watches through RLS'
);

select throws_ok(
  $$ insert into public.watches (user_id, brand, model, purchase_price, purchase_date, condition, category)
     values ('22222222-2222-2222-2222-222222222222', 'Cartier', 'Santos', 5000, current_date, 'good', 'dress') $$,
  'new row violates row-level security policy for table "watches"',
  'cannot insert a watch for another user'
);

insert into public.price_alerts (user_id, watch_id, watch_ref, brand, model, condition, target_price)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '126610LN', 'Rolex', 'Submariner', 'below', 12000);

select is(
  (select count(*)::integer from public.price_alerts),
  1,
  'price alerts are scoped to the active user'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select is(
  (select count(*)::integer from public.price_alerts),
  0,
  'other users cannot see another collector''s alerts'
);

select is(
  (select count(*)::integer from public.market_brand_snapshots),
  2,
  'shared market snapshots remain readable to authenticated users'
);

select is(
  (select count(*)::integer from public.news_articles),
  2,
  'shared news articles remain readable to authenticated users'
);

select * from finish();
rollback;
