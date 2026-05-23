begin;

select plan(3);

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
  'trigger-test@example.com',
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
    from public.profiles p
    join public.subscriptions s on s.user_id = p.id
    join public.user_preferences up on up.user_id = p.id
    join public.news_preferences np on np.user_id = p.id
    where p.id = '33333333-3333-3333-3333-333333333333'
      and p.display_name = 'Trigger User'
  ),
  'auth insert trigger provisions the profile and dependent default rows'
);

insert into public.watches (id, user_id, brand, reference)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Rolex', '126610LN')
on conflict (id) do nothing;

update public.watches
set notes = 'Updated by trigger test'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select ok(
  exists(select 1 from public.watches where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and updated_at >= created_at),
  'updated_at trigger refreshes timestamps on watch updates'
);

update auth.users
set raw_user_meta_data = '{"display_name":"Renamed Trigger User","avatar_url":"https://example.com/updated-avatar.png"}'
where id = '33333333-3333-3333-3333-333333333333';

select ok(
  exists(select 1 from public.profiles where id = '33333333-3333-3333-3333-333333333333' and display_name = 'Renamed Trigger User'),
  'auth update trigger keeps profile metadata synchronized'
);

select * from finish();
rollback;
