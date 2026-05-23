insert into public.market_brand_snapshots (brand, snapshot_date, current_index, sentiment_score, price_change_percent, source, metadata)
values
  ('Rolex', current_date - interval '30 days', 118.40, 7.80, 1.90, 'seed', '{"segment":"sport"}'),
  ('Rolex', current_date, 121.10, 8.10, 2.30, 'seed', '{"segment":"sport"}'),
  ('Patek Philippe', current_date - interval '30 days', 112.50, 7.10, 1.20, 'seed', '{"segment":"dress"}'),
  ('Patek Philippe', current_date, 113.90, 7.40, 1.60, 'seed', '{"segment":"dress"}'),
  ('Audemars Piguet', current_date - interval '30 days', 109.20, 6.90, 0.80, 'seed', '{"segment":"sport"}'),
  ('Audemars Piguet', current_date, 110.00, 7.00, 1.10, 'seed', '{"segment":"sport"}')
on conflict (brand, snapshot_date) do nothing;

insert into public.auction_results (brand, model, reference_number, sale_date, sale_price, currency, auction_house, location, lot_number, result_url, metadata)
values
  ('Rolex', 'Daytona', '116500LN', current_date - interval '14 days', 28500, 'USD', 'Phillips', 'Geneva', '24', 'https://example.com/auction/rolex-daytona', '{"condition":"excellent"}'),
  ('Patek Philippe', 'Nautilus', '5711/1A', current_date - interval '21 days', 84500, 'USD', 'Christie''s', 'Hong Kong', '11', 'https://example.com/auction/patek-nautilus', '{"condition":"excellent"}')
on conflict do nothing;

insert into public.news_articles (title, summary, url, image_url, source, source_icon, published_at, brands, tags, canonical_score)
values
  ('Rolex secondary prices stabilize after spring auctions', 'Auction comps and dealer inventory suggest a healthier bid-ask spread for modern Rolex sports references.', 'https://example.com/news/rolex-stabilize', 'https://images.example.com/rolex.jpg', 'WatchWire', 'https://images.example.com/source/watchwire.png', timezone('utc', now()) - interval '1 day', array['Rolex'], array['market', 'auctions'], 8.2),
  ('Why integrated-bracelet icons still dominate collector demand', 'Patek Philippe and Audemars Piguet continue to lead inquiry volume among high-end steel sports watches.', 'https://example.com/news/integrated-icons', 'https://images.example.com/icons.jpg', 'Horology Daily', 'https://images.example.com/source/horology-daily.png', timezone('utc', now()) - interval '2 days', array['Patek Philippe', 'Audemars Piguet'], array['analysis', 'sports'], 7.9)
on conflict (url) do nothing;
