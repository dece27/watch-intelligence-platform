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
  '{"name":"Trigger User","vault_name":"Trigger Vault"}',
  timezone('utc', now()),
  timezone('utc', now())
)
on conflict (id) do nothing;

select ok(
  exists(select 1 from public.profiles where id = '33333333-3333-3333-3333-333333333333' and vault_name = 'Trigger Vault'),
  'auth insert trigger provisions a profile row'
);

update public.watches
set notes = 'Updated by trigger test'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select ok(
  exists(select 1 from public.watches where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and updated_at >= created_at),
  'updated_at trigger refreshes timestamps on watch updates'
);

update auth.users
set raw_user_meta_data = '{"name":"Renamed Trigger User","vault_name":"Renamed Vault"}'
where id = '33333333-3333-3333-3333-333333333333';

select ok(
  exists(select 1 from public.profiles where id = '33333333-3333-3333-3333-333333333333' and vault_name = 'Renamed Vault'),
  'auth update trigger keeps profiles synchronized'
);

select * from finish();
rollback;
