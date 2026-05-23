import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { BrandIndex } from '@/lib/types'
import type { Database, Json, TableInsert, TableRow, ViewRow } from '@/lib/supabase/types'

export interface MarketPriceRecord {
  brand: string
  reference: string
  priceUsd: number
  source: string
  condition?: string
  recordedAt: string
}

export interface MarketPriceInput {
  brand: string
  reference: string
  priceUsd: number
  source: string
  condition?: string
  recordedAt?: string
}

export interface MarketCacheRecord {
  cacheKey: string
  data: Json
  source?: string
  computedAt: string
  expiresAt: string
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapLatestPrice(row: ViewRow<'latest_market_prices'>): MarketPriceRecord {
  return {
    brand: row.brand,
    reference: row.reference,
    priceUsd: row.price_usd,
    source: row.source,
    condition: row.condition ?? undefined,
    recordedAt: row.recorded_at,
  }
}

function mapCache(row: TableRow<'market_data_cache'>): MarketCacheRecord {
  return {
    cacheKey: row.cache_key,
    data: row.data,
    source: row.source ?? undefined,
    computedAt: row.computed_at,
    expiresAt: row.expires_at,
  }
}

function toInsert(price: MarketPriceInput): TableInsert<'market_price_history'> {
  return {
    brand: price.brand,
    reference: price.reference,
    price_usd: price.priceUsd,
    source: price.source,
    condition: price.condition ?? null,
    recorded_at: price.recordedAt,
  }
}

export async function listLatestMarketPrices(
  client: Pick<SupabaseClient<Database>, 'from'>,
  brands?: string[],
): Promise<MarketPriceRecord[]> {
  let query = client
    .from('latest_market_prices')
    .select('*')
    .order('recorded_at', { ascending: false })

  if (brands && brands.length > 0) {
    query = query.in('brand', brands)
  }

  const { data, error } = await query
  throwIfError(error)
  return (data ?? []).map(mapLatestPrice)
}

export async function listBrandIndexes(client: Pick<SupabaseClient<Database>, 'from'>): Promise<BrandIndex[]> {
  const prices = await listLatestMarketPrices(client)
  const grouped = new Map<string, number[]>()

  for (const price of prices) {
    const values = grouped.get(price.brand) ?? []
    values.push(price.priceUsd)
    grouped.set(price.brand, values)
  }

  return Array.from(grouped.entries()).map(([brand, values]) => ({
    brand,
    currentIndex: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
    trend: values,
  }))
}

export async function upsertMarketPrices(
  client: Pick<SupabaseClient<Database>, 'from'>,
  prices: MarketPriceInput[],
): Promise<MarketPriceRecord[]> {
  const { data, error } = await client
    .from('market_price_history')
    .insert(prices.map(toInsert))
    .select('brand, reference, price_usd, source, condition, recorded_at')

  throwIfError(error)
  return (data ?? []).map((row) => ({
    brand: row.brand,
    reference: row.reference,
    priceUsd: row.price_usd,
    source: row.source,
    condition: row.condition ?? undefined,
    recordedAt: row.recorded_at,
  }))
}

export async function getMarketDataCache(
  client: Pick<SupabaseClient<Database>, 'from'>,
  cacheKey: string,
): Promise<MarketCacheRecord | null> {
  const { data, error } = await client
    .from('market_data_cache')
    .select('*')
    .eq('cache_key', cacheKey)
    .maybeSingle()

  throwIfError(error)
  return data ? mapCache(data) : null
}

export async function upsertMarketDataCache(
  client: Pick<SupabaseClient<Database>, 'from'>,
  cache: Omit<MarketCacheRecord, 'computedAt'>,
): Promise<MarketCacheRecord> {
  const { data, error } = await client
    .from('market_data_cache')
    .upsert(
      {
        cache_key: cache.cacheKey,
        data: cache.data,
        source: cache.source ?? null,
        expires_at: cache.expiresAt,
      },
      { onConflict: 'cache_key' },
    )
    .select('*')
    .single()

  throwIfError(error)
  return mapCache(data)
}
