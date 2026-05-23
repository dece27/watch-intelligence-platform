begin;

select plan(8);

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
  '33333333-3333-3333-3333-333333333333',
  'authenticated',
  'authenticated',
  'trigger-user@example.com',
  crypt('password', gen_salt('bf')),
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Trigger User","avatar_url":"https://example.com/avatar.png"}',
  timezone('utc', now()),
  timezone('utc', now())
)
on conflict (id) do nothing;

select ok(
  exists(
    select 1
    from public.profiles
    where id = '33333333-3333-3333-3333-333333333333'
      and display_name = 'Trigger User'
      and avatar_url = 'https://example.com/avatar.png'
  ),
  'handle_new_user creates the profile with auth metadata'
);

select ok(
  exists(
    select 1
    from public.subscriptions
    where user_id = '33333333-3333-3333-3333-333333333333'
      and plan = 'free'
  ),
  'handle_new_user creates a default subscription'
);

select ok(
  exists(
    select 1
    from public.user_preferences up
    join public.news_preferences np on np.user_id = up.user_id
    where up.user_id = '33333333-3333-3333-3333-333333333333'
  ),
  'handle_new_user creates preference rows'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);

insert into public.watches (id, user_id, brand, reference, notes)
values ('aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Rolex', '126610LN', 'Initial note')
on conflict (id) do nothing;

insert into public.price_alerts (id, user_id, brand, reference, direction, target_price)
values ('bbbbbbbb-3333-3333-3333-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'Rolex', '126610LN', 'above', 12000)
on conflict (id) do nothing;

select ok(
  (
    with before_row as (
      select updated_at from public.profiles where id = '33333333-3333-3333-3333-333333333333'
    ),
    pause as (
      select pg_sleep(0.01)
    ),
    updated as (
      update public.profiles
      set location = 'New York'
      where id = '33333333-3333-3333-3333-333333333333'
      returning updated_at
    )
    select (select updated_at from updated) > (select updated_at from before_row)
  ),
  'updated_at auto-updates on profiles'
);

select ok(
  (
    with before_row as (
      select updated_at from public.watches where id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa'
    ),
    pause as (
      select pg_sleep(0.01)
    ),
    updated as (
      update public.watches
      set notes = 'Updated watch note'
      where id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa'
      returning updated_at
    )
    select (select updated_at from updated) > (select updated_at from before_row)
  ),
  'updated_at auto-updates on watches'
);

select ok(
  (
    with before_row as (
      select updated_at from public.price_alerts where id = 'bbbbbbbb-3333-3333-3333-bbbbbbbbbbbb'
    ),
    pause as (
      select pg_sleep(0.01)
    ),
    updated as (
      update public.price_alerts
      set target_price = 12500
      where id = 'bbbbbbbb-3333-3333-3333-bbbbbbbbbbbb'
      returning updated_at
    )
    select (select updated_at from updated) > (select updated_at from before_row)
  ),
  'updated_at auto-updates on price_alerts'
);

select public.soft_delete_watch(
  'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa',
  '33333333-3333-3333-3333-333333333333'
);

select ok(
  exists(
    select 1
    from public.watches
    where id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa'
      and deleted_at is not null
  ),
  'soft_delete_watch sets deleted_at'
);

select is(
  (select count(*)::integer from public.watches where id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa'),
  0,
  'soft-deleted watch disappears from RLS-filtered queries'
);

select * from finish();
rollback;
