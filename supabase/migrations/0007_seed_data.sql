insert into public.market_price_history (brand, reference, price_usd, source, condition, recorded_at)
values
  ('Rolex', '126610LN', 13450, 'seed', 'Excellent', timezone('utc', now()) - interval '7 days'),
  ('Rolex', '126610LN', 13625, 'seed', 'Excellent', timezone('utc', now()) - interval '1 day'),
  ('Patek Philippe', '5711/1A', 84200, 'seed', 'Excellent', timezone('utc', now()) - interval '2 days'),
  ('Audemars Piguet', '15510ST', 38200, 'seed', 'Mint', timezone('utc', now()) - interval '1 day');

insert into public.market_data_cache (cache_key, data, source, expires_at)
values (
  'market:rolex:126610ln',
  '{"brand":"Rolex","reference":"126610LN","priceUsd":13625}'::jsonb,
  'seed',
  timezone('utc', now()) + interval '15 minutes'
)
on conflict (cache_key) do update
set data = excluded.data,
    source = excluded.source,
    computed_at = timezone('utc', now()),
    expires_at = excluded.expires_at;

insert into public.deal_listings (
  brand,
  model,
  reference,
  year,
  condition,
  asking_price,
  fair_value,
  currency,
  seller_rating,
  days_listed,
  location,
  has_box,
  has_papers,
  source,
  external_url,
  photo_url
)
values
  (
    'Rolex',
    'Submariner Date',
    '126610LN',
    2023,
    'Excellent',
    12800,
    13625,
    'USD',
    4.8,
    6,
    'Geneva',
    true,
    true,
    'seed',
    'https://example.com/deals/126610ln',
    'https://images.example.com/126610ln.jpg'
  ),
  (
    'Omega',
    'Speedmaster Professional',
    '310.30.42.50.01.001',
    2022,
    'Mint',
    6200,
    6700,
    'USD',
    4.6,
    10,
    'Tokyo',
    true,
    true,
    'seed',
    'https://example.com/deals/speedmaster',
    'https://images.example.com/speedmaster.jpg'
  );

insert into public.news_cache (cache_key, articles, cached_at)
values (
  'feed_all',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'article-rolex-stability',
      'title', 'Rolex secondary market shows signs of stabilization',
      'summary', 'Auction and dealer data show tighter bid-ask spreads for modern Rolex references.',
      'url', 'https://example.com/news/rolex-stability',
      'source', 'WatchWire',
      'brands', jsonb_build_array('Rolex'),
      'tags', jsonb_build_array('market', 'auctions'),
      'publishedAt', timezone('utc', now()) - interval '1 day'
    ),
    jsonb_build_object(
      'id', 'article-integrated-sports',
      'title', 'Integrated-bracelet icons continue to lead demand',
      'summary', 'Collectors remain focused on steel sports models from the Holy Trinity.',
      'url', 'https://example.com/news/integrated-demand',
      'source', 'Horology Daily',
      'brands', jsonb_build_array('Patek Philippe', 'Audemars Piguet'),
      'tags', jsonb_build_array('analysis', 'sports'),
      'publishedAt', timezone('utc', now()) - interval '2 days'
    )
  ),
  timezone('utc', now())
)
on conflict (cache_key) do update
set articles = excluded.articles,
    cached_at = excluded.cached_at;
