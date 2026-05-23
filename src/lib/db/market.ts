import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { BrandIndex } from '@/lib/types'
import type { Database, TableInsert, TableRow, ViewRow } from '@/lib/supabase/types'

export interface MarketSnapshot {
  brand: string
  snapshotDate: string
  currentIndex: number
  sentimentScore: number
  priceChangePercent?: number
  source: string
  metadata: unknown
  createdAt: string
}

export interface AuctionResultRecord {
  id: string
  brand: string
  model: string
  referenceNumber?: string
  saleDate: string
  salePrice: number
  currency: string
  auctionHouse: string
  location?: string
  lotNumber?: string
  resultUrl?: string
  metadata: unknown
  createdAt: string
}

export interface MarketSnapshotInput {
  brand: string
  snapshotDate: string
  currentIndex: number
  sentimentScore: number
  priceChangePercent?: number
  source?: string
  metadata?: Record<string, unknown>
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapLatestSnapshot(row: ViewRow<'latest_market_brand_snapshots'>): MarketSnapshot {
  return {
    brand: row.brand,
    snapshotDate: row.snapshot_date,
    currentIndex: row.current_index,
    sentimentScore: row.sentiment_score,
    priceChangePercent: row.price_change_percent ?? undefined,
    source: row.source,
    metadata: row.metadata,
    createdAt: row.created_at,
  }
}

function mapAuctionResult(row: TableRow<'auction_results'>): AuctionResultRecord {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    referenceNumber: row.reference_number ?? undefined,
    saleDate: row.sale_date,
    salePrice: row.sale_price,
    currency: row.currency,
    auctionHouse: row.auction_house,
    location: row.location ?? undefined,
    lotNumber: row.lot_number ?? undefined,
    resultUrl: row.result_url ?? undefined,
    metadata: row.metadata,
    createdAt: row.created_at,
  }
}

function toInsert(snapshot: MarketSnapshotInput): TableInsert<'market_brand_snapshots'> {
  return {
    brand: snapshot.brand,
    snapshot_date: snapshot.snapshotDate,
    current_index: snapshot.currentIndex,
    sentiment_score: snapshot.sentimentScore,
    price_change_percent: snapshot.priceChangePercent ?? null,
    source: snapshot.source ?? 'internal',
    metadata: snapshot.metadata ?? {},
  }
}

export async function listLatestMarketSnapshots(client: Pick<SupabaseClient<Database>, 'from'>): Promise<MarketSnapshot[]> {
  const { data, error } = await client
    .from('latest_market_brand_snapshots')
    .select('*')
    .order('current_index', { ascending: false })

  throwIfError(error)
  return (data ?? []).map(mapLatestSnapshot)
}

export async function listBrandIndexes(client: Pick<SupabaseClient<Database>, 'from'>): Promise<BrandIndex[]> {
  const snapshots = await listLatestMarketSnapshots(client)
  return snapshots.map((snapshot) => ({
    brand: snapshot.brand,
    currentIndex: snapshot.currentIndex,
    trend: [snapshot.sentimentScore],
  }))
}

export async function upsertMarketSnapshots(
  client: Pick<SupabaseClient<Database>, 'from'>,
  snapshots: MarketSnapshotInput[],
): Promise<MarketSnapshot[]> {
  const { data, error } = await client
    .from('market_brand_snapshots')
    .upsert(snapshots.map(toInsert), { onConflict: 'brand,snapshot_date' })
    .select('brand, snapshot_date, current_index, sentiment_score, price_change_percent, source, metadata, created_at')

  throwIfError(error)
  return (data ?? []).map((row) => mapLatestSnapshot({
    brand: row.brand,
    snapshot_date: row.snapshot_date,
    current_index: row.current_index,
    sentiment_score: row.sentiment_score,
    price_change_percent: row.price_change_percent,
    source: row.source,
    metadata: row.metadata,
    created_at: row.created_at,
  }))
}

export async function listAuctionResults(
  client: Pick<SupabaseClient<Database>, 'from'>,
  brands?: string[],
  limit = 20,
): Promise<AuctionResultRecord[]> {
  let query = client
    .from('auction_results')
    .select('*')
    .order('sale_date', { ascending: false })
    .limit(limit)

  if (brands && brands.length > 0) {
    query = query.in('brand', brands)
  }

  const { data, error } = await query
  throwIfError(error)
  return (data ?? []).map(mapAuctionResult)
}
