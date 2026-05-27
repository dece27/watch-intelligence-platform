alter table public.watches
  add column if not exists market_value decimal(14, 2) check (market_value >= 0),
  add column if not exists market_source text check (
    market_source in ('watchcharts', 'thewatchapi', 'ebay', 'heuristic', 'manual', 'unavailable')
  ),
  add column if not exists market_confidence numeric(4, 3) check (
    market_confidence >= 0 and market_confidence <= 1
  ),
  add column if not exists market_updated_at timestamptz;
