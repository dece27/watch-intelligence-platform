import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, TableInsert, ViewRow } from '@/lib/supabase/types'

export interface PortfolioSummary {
  userId: string
  snapshotDate: string
  totalCostBasis: number
  totalMarketValue: number
  watchCount: number
  brandBreakdown?: Json
  returnPercent: number
  createdAt: string
}

export interface PortfolioBrandAllocation {
  userId: string
  brand: string
  watchCount: number
  totalValue: number
  allocationPercent: number
}

export interface PortfolioSnapshotInput {
  id?: string
  userId: string
  snapshotDate: string
  totalCostBasis: number
  totalMarketValue: number
  watchCount: number
  brandBreakdown?: Json
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapSummary(row: ViewRow<'portfolio_snapshot'>): PortfolioSummary {
  return {
    userId: row.user_id,
    snapshotDate: row.snapshot_date,
    totalCostBasis: row.total_cost_basis,
    totalMarketValue: row.total_market_value,
    watchCount: row.watch_count,
    brandBreakdown: row.brand_breakdown ?? undefined,
    returnPercent: row.return_percent ?? 0,
    createdAt: row.created_at,
  }
}

function mapAllocation(row: ViewRow<'portfolio_brand_allocations'>): PortfolioBrandAllocation {
  return {
    userId: row.user_id,
    brand: row.brand,
    watchCount: row.watch_count,
    totalValue: row.total_value,
    allocationPercent: row.allocation_percent,
  }
}

function toInsert(snapshot: PortfolioSnapshotInput): TableInsert<'portfolio_snapshots'> {
  return {
    id: snapshot.id,
    user_id: snapshot.userId,
    snapshot_date: snapshot.snapshotDate,
    total_cost_basis: snapshot.totalCostBasis,
    total_market_value: snapshot.totalMarketValue,
    watch_count: snapshot.watchCount,
    brand_breakdown: snapshot.brandBreakdown ?? null,
  }
}

export async function getPortfolioSummary(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
): Promise<PortfolioSummary | null> {
  const { data, error } = await client
    .from('portfolio_snapshot')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  throwIfError(error)
  return data ? mapSummary(data) : null
}

export async function listPortfolioBrandAllocations(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
): Promise<PortfolioBrandAllocation[]> {
  const { data, error } = await client
    .from('portfolio_brand_allocations')
    .select('*')
    .eq('user_id', userId)
    .order('allocation_percent', { ascending: false })

  throwIfError(error)
  return (data ?? []).map(mapAllocation)
}

export async function upsertPortfolioSnapshot(
  client: Pick<SupabaseClient<Database>, 'from'>,
  snapshot: PortfolioSnapshotInput,
): Promise<PortfolioSnapshotInput> {
  const { data, error } = await client
    .from('portfolio_snapshots')
    .upsert(toInsert(snapshot), { onConflict: 'user_id,snapshot_date' })
    .select('id, user_id, snapshot_date, total_cost_basis, total_market_value, watch_count, brand_breakdown')
    .single()

  throwIfError(error)
  return {
    id: data.id,
    userId: data.user_id,
    snapshotDate: data.snapshot_date,
    totalCostBasis: data.total_cost_basis,
    totalMarketValue: data.total_market_value,
    watchCount: data.watch_count,
    brandBreakdown: data.brand_breakdown ?? undefined,
  }
}
