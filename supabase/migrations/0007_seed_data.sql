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
  seller_rating,
  days_listed,
  location,
  has_box,
  has_papers,
  source
)
values
  (
    'Rolex',
    'Submariner No-Date',
    '124060',
    2022,
    'Mint',
    10200,
    11400,
    4.8,
    2,
    'New York, USA',
    true,
    true,
    'mock'
  ),
  (
    'Patek Philippe',
    'Nautilus Annual Cal.',
    '5726/1A',
    2019,
    'Very Good',
    68000,
    72000,
    4.5,
    5,
    'Geneva, CH',
    true,
    true,
    'mock'
  ),
  (
    'Audemars Piguet',
    'Royal Oak 41mm',
    '15500ST',
    2021,
    'Excellent',
    39500,
    40500,
    4.7,
    1,
    'Hong Kong',
    true,
    false,
    'mock'
  ),
  (
    'Rolex',
    'Daytona Ceramic',
    '116500LN',
    2019,
    'Mint',
    30800,
    31000,
    4.9,
    3,
    'London, UK',
    true,
    true,
    'mock'
  ),
  (
    'Rolex',
    'GMT-Master II Batman',
    '126710BLNR',
    2021,
    'Very Good',
    17200,
    18500,
    4.6,
    6,
    'Dubai, UAE',
    true,
    true,
    'mock'
  ),
  (
    'Grand Seiko',
    'White Birch Evo 9',
    'SLGH005',
    2023,
    'Unworn',
    6800,
    7200,
    4.9,
    1,
    'Tokyo, JP',
    true,
    true,
    'mock'
  ),
  (
    'Omega',
    'Speedmaster Pro',
    '310.30.42.50.01.001',
    2022,
    'Mint',
    7200,
    7800,
    4.7,
    4,
    'Amsterdam, NL',
    true,
    true,
    'mock'
  ),
  (
    'Rolex',
    'Submariner Date',
    '126610LN',
    2020,
    'Excellent',
    14800,
    16000,
    4.4,
    9,
    'Miami, USA',
    false,
    false,
    'mock'
  ),
  (
    'Patek Philippe',
    'Aquanaut (discontinued)',
    '5167/1A',
    2020,
    'Very Good',
    51000,
    54000,
    4.6,
    7,
    'Singapore',
    true,
    true,
    'mock'
  ),
  (
    'Rolex',
    'GMT-Master II Pepsi',
    '126710BLRO',
    2022,
    'Mint',
    19800,
    21000,
    4.8,
    2,
    'Zurich, CH',
    true,
    true,
    'mock'
  ),
  (
    'IWC',
    'Portugieser Chronograph',
    'IW371601',
    2021,
    'Very Good',
    6200,
    7000,
    4.3,
    14,
    'Paris, FR',
    true,
    false,
    'mock'
  ),
  (
    'Audemars Piguet',
    'Royal Oak Jumbo',
    '15202ST',
    2017,
    'Excellent',
    60000,
    65000,
    4.7,
    8,
    'Beverly Hills, USA',
    true,
    true,
    'mock'
  ),
  (
    'Breitling',
    'Navitimer B01 Chrono',
    'AB0139',
    2021,
    'Very Good',
    5800,
    6400,
    4.2,
    11,
    'Milan, IT',
    true,
    true,
    'mock'
  ),
  (
    'Cartier',
    'Santos Large Steel',
    'WSSA0018',
    2022,
    'Mint',
    7100,
    7600,
    4.6,
    3,
    'Rome, IT',
    true,
    true,
    'mock'
  ),
  (
    'Grand Seiko',
    'Snowflake Spring Drive',
    'SBGA211',
    2020,
    'Excellent',
    5600,
    6400,
    4.5,
    5,
    'Seoul, KR',
    true,
    false,
    'mock'
  )
on conflict do nothing;

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
