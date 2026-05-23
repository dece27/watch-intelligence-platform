begin;

select plan(4);

insert into public.profiles (id, email, name, vault_name)
values ('44444444-4444-4444-4444-444444444444', 'functions@example.com', 'Function User', 'Function Vault')
on conflict (id) do nothing;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

select ok(
  exists(
    select 1
    from public.save_collection_share(
      'share_slug_01',
      '[{"id":"watch-1","brand":"Rolex","model":"GMT-Master II","purchasePrice":12000,"purchaseDate":"2024-01-01","condition":"excellent","category":"sport"}]'::jsonb,
      null
    )
  ),
  'save_collection_share upserts a collector-owned public snapshot'
);

select is(
  (select owner_vault_name from public.get_shared_collection('share_slug_01')),
  'Function Vault',
  'get_shared_collection exposes only the requested public share'
);

select ok(
  exists(select 1 from public.record_ai_usage(512, 2) where user_id = '44444444-4444-4444-4444-444444444444' and ai_tokens_used >= 512),
  'record_ai_usage accumulates usage totals for the active user'
);

select is(
  (select ai_requests_count from public.ai_usage where user_id = '44444444-4444-4444-4444-444444444444'),
  2,
  'record_ai_usage increments request counters'
);

select * from finish();
rollback;
