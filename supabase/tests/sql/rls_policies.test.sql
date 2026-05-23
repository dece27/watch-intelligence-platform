begin;

select plan(24);

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
    'alice@example.com',
    crypt('password', gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Alice"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated',
    'authenticated',
    'bob@example.com',
    crypt('password', gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Bob"}',
    timezone('utc', now()),
    timezone('utc', now())
  )
on conflict (id) do nothing;

insert into public.watches (id, user_id, brand, model, reference, purchase_price, condition, notes)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'Rolex', 'Submariner', '126610LN', 10000, 'Excellent', 'Alice watch 1'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', 'Omega', 'Speedmaster', '310.30.42.50.01.001', 7000, 'Very Good', 'Alice watch 2'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', 'Cartier', 'Santos', 'WSSA0018', 6500, 'Good', 'Bob watch')
on conflict (id) do nothing;

insert into public.price_alerts (id, user_id, brand, reference, direction, target_price)
values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', '11111111-1111-1111-1111-111111111111', 'Rolex', '126610LN', 'above', 12000),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2', '22222222-2222-2222-2222-222222222222', 'Cartier', 'WSSA0018', 'below', 6000)
on conflict (id) do nothing;

insert into public.news_relevance_scores (id, article_id, user_id, score, reason)
values
  ('dddddddd-dddd-dddd-dddd-ddddddddddd1', 'article-alice', '11111111-1111-1111-1111-111111111111', 90, 'Alice relevance'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd2', 'article-bob', '22222222-2222-2222-2222-222222222222', 70, 'Bob relevance')
on conflict (article_id, user_id) do nothing;

insert into public.news_saved (id, user_id, article_id, article)
values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', '11111111-1111-1111-1111-111111111111', 'saved-alice', '{"title":"Alice article"}'::jsonb),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', '22222222-2222-2222-2222-222222222222', 'saved-bob', '{"title":"Bob article"}'::jsonb)
on conflict (user_id, article_id) do nothing;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select is(
  (select count(*)::integer from public.watches),
  2,
  'Alice can read her own watches'
);

select is(
  (select count(*)::integer from public.price_alerts),
  1,
  'price alerts are isolated for Alice'
);

select is(
  (select count(*)::integer from public.news_relevance_scores),
  1,
  'news scores are isolated for Alice'
);

select is(
  (select count(*)::integer from public.news_saved),
  1,
  'saved articles are isolated for Alice'
);

select is(
  (select count(*)::integer from public.subscriptions where user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'subscription is readable by its owner'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select is(
  (select count(*)::integer from public.watches where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'Bob cannot read Alice watches before sharing'
);

select throws_ok(
  $$ insert into public.watches (user_id, brand, reference)
     values ('11111111-1111-1111-1111-111111111111', 'Patek Philippe', '5711/1A-010') $$,
  'new row violates row-level security policy for table "watches"',
  'Bob cannot insert into Alice watches'
);

select is(
  (
    with updated as (
      update public.watches
      set notes = 'Bob update attempt'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
      returning 1
    )
    select count(*)::integer from updated
  ),
  0,
  'Bob cannot update Alice records'
);

select is(
  (
    with deleted as (
      delete from public.watches
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
      returning 1
    )
    select count(*)::integer from deleted
  ),
  0,
  'Bob cannot delete Alice records'
);

select is(
  (select count(*)::integer from public.price_alerts),
  1,
  'price alerts are isolated for Bob'
);

select is(
  (select count(*)::integer from public.news_relevance_scores),
  1,
  'news scores are isolated for Bob'
);

select is(
  (select count(*)::integer from public.news_saved),
  1,
  'saved articles are isolated for Bob'
);

select is(
  (select count(*)::integer from public.subscriptions where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'subscription is not readable by another user'
);

insert into public.share_tokens (id, user_id, token, hide_prices)
values ('ffffffff-ffff-ffff-ffff-fffffffffff1', '11111111-1111-1111-1111-111111111111', 'alice-share-token', true)
on conflict (id) do nothing;

select is(
  (select count(*)::integer from public.watches where user_id = '11111111-1111-1111-1111-111111111111'),
  2,
  'share token grants Bob read-only access to Alice watches'
);

select ok(
  (
    select not ((watches -> 0) ? 'purchasePrice')
    from public.get_shared_collection('alice-share-token')
    limit 1
  ),
  'shared collection hides purchase prices'
);

select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000123', true);

select is(
  (select count(*)::integer from public.watches),
  0,
  'unauthenticated users see zero watch rows'
);

select is(
  (select count(*)::integer from public.price_alerts),
  0,
  'unauthenticated users see zero price alert rows'
);

select is(
  (select count(*)::integer from public.news_relevance_scores),
  0,
  'unauthenticated users see zero news score rows'
);

select is(
  (select count(*)::integer from public.news_saved),
  0,
  'unauthenticated users see zero saved article rows'
);

select is(
  (select count(*)::integer from public.subscriptions),
  0,
  'unauthenticated users see zero subscription rows'
);

select is(
  (
    with inserted as (
      insert into public.feedback (user_id, message, category)
      values (null, 'Anonymous feedback', 'other')
      returning user_id
    )
    select count(*)::integer from inserted where user_id is null
  ),
  1,
  'feedback insert works unauthenticated when user_id is null'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000999', true);

select is(
  (select count(*)::integer from public.watches),
  3,
  'service role can read all watch rows'
);

select is(
  (select count(*)::integer from public.price_alerts),
  2,
  'service role can read all price alert rows'
);

select is(
  (select count(*)::integer from public.subscriptions),
  2,
  'service role can read all subscription rows'
);

select * from finish();
rollback;
