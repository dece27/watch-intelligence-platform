begin;

select plan(4);

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
values (
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-4444-444444444444',
  'authenticated',
  'authenticated',
  'functions@example.com',
  crypt('password', gen_salt('bf')),
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Function User"}',
  timezone('utc', now()),
  timezone('utc', now())
)
on conflict (id) do nothing;

insert into public.watches (user_id, brand, model, reference, purchase_price, condition)
values ('44444444-4444-4444-4444-444444444444', 'Rolex', 'GMT-Master II', '126710BLRO', 12000, 'Excellent');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

select ok(
  exists(select 1 from public.create_share_token(true, null)),
  'create_share_token provisions a collector-owned share token'
);

select ok(
  exists(select 1 from public.get_shared_collection((select token from public.share_tokens where user_id = '44444444-4444-4444-4444-444444444444' limit 1))),
  'get_shared_collection resolves the current shared watch collection by token'
);

select ok(
  exists(select 1 from public.record_ai_usage('signal', 512, current_date, 2) where user_id = '44444444-4444-4444-4444-444444444444' and tokens_used >= 512),
  'record_ai_usage accumulates usage totals for the active user'
);

select is(
  (select call_count from public.ai_usage_logs where user_id = '44444444-4444-4444-4444-444444444444' and call_type = 'signal'),
  2,
  'record_ai_usage increments request counters'
);

select * from finish();
rollback;
