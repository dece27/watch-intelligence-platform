begin;

select plan(6);

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
    '11111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'collector-a@example.com',
    crypt('password', gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Collector A"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated',
    'authenticated',
    'collector-b@example.com',
    crypt('password', gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Collector B"}',
    timezone('utc', now()),
    timezone('utc', now())
  )
on conflict (id) do nothing;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.watches (id, user_id, brand, model, reference, purchase_price, condition)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Rolex', 'Submariner', '126610LN', 10000, 'Excellent'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Omega', 'Speedmaster', '310.30.42.50.01.001', 7000, 'Good')
on conflict (id) do nothing;

select is(
  (select count(*)::integer from public.watches),
  1,
  'authenticated users only see their own watches through RLS'
);

select throws_ok(
  $$ insert into public.watches (user_id, brand, reference)
     values ('22222222-2222-2222-2222-222222222222', 'Cartier', 'WSSA0018') $$,
  'new row violates row-level security policy for table "watches"',
  'cannot insert a watch for another user'
);

insert into public.price_alerts (user_id, brand, reference, direction, target_price)
values ('11111111-1111-1111-1111-111111111111', 'Rolex', '126610LN', 'below', 12000);

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
  (select count(*)::integer from public.market_price_history),
  4,
  'shared market history remains readable to authenticated users'
);

select is(
  (select count(*)::integer from public.deal_listings where is_active = true),
  2,
  'shared deal listings remain readable to authenticated users'
);

select * from finish();
rollback;
