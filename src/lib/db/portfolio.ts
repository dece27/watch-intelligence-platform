import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, ViewRow } from '@/lib/supabase/types'

export interface PortfolioSummary {
  userId: string
  watchCount: number
  totalCost: number
  totalEstimatedValue: number
  averageReturnPercent: number
  lastUpdatedAt?: string
}

export interface PortfolioBrandAllocation {
  userId: string
  brand: string
  watchCount: number
  totalValue: number
  allocationPercent: number
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapSummary(row: ViewRow<'portfolio_snapshot'>): PortfolioSummary {
  return {
    userId: row.user_id,
    watchCount: row.watch_count,
    totalCost: row.total_cost,
    totalEstimatedValue: row.total_estimated_value,
    averageReturnPercent: row.average_return_percent,
    lastUpdatedAt: row.last_updated_at ?? undefined,
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
