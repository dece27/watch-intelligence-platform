begin;

select plan(7);

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

update public.profiles
set is_public = true
where id = '11111111-1111-1111-1111-111111111111';

insert into public.watches (id, user_id, brand, model, reference, purchase_price, condition)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Rolex', 'Submariner', '126610LN', 10000, 'Excellent')
on conflict (id) do nothing;

select is(
  (select count(*)::integer from public.watches),
  1,
  'authenticated users see their own non-deleted watches'
);

select throws_ok(
  $$ insert into public.watches (user_id, brand, reference)
     values ('22222222-2222-2222-2222-222222222222', 'Cartier', 'WSSA0018') $$,
  'new row violates row-level security policy for table "watches"',
  'cannot insert a watch for another user'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select is(
  (select count(*)::integer from public.watches where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'other users cannot read watches before a share token exists'
);

select is(
  (select count(*)::integer from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'public profiles are readable to other authenticated users'
);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.share_tokens (user_id)
values ('11111111-1111-1111-1111-111111111111');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select is(
  (select count(*)::integer from public.watches where user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'valid share tokens expose shared collection watches to other users'
);

select is(
  (select count(*)::integer from public.market_price_history),
  4,
  'authenticated users can read shared market price history'
);

select is(
  (select count(*)::integer from public.deal_listings where is_active = true),
  2,
  'authenticated users can read active deal listings'
);

select * from finish();
rollback;
