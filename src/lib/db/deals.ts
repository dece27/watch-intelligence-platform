import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Deal } from '@/lib/types'
import type { Database, TableInsert, TableRow } from '@/lib/supabase/types'
import { createCacheKey } from '@/lib/cache/strategy'

export interface PersistedDeal extends Deal {
  userId: string
  externalId: string
  payload?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface PersistedDealInput extends Deal {
  userId: string
  externalId?: string
  payload?: Record<string, unknown>
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapDeal(row: TableRow<'deal_matches'>): PersistedDeal {
  return {
    id: row.id,
    userId: row.user_id,
    externalId: row.external_id,
    brand: row.brand,
    model: row.model,
    referenceNumber: row.reference_number ?? undefined,
    price: row.price,
    currency: row.currency,
    marketValue: row.market_value ?? undefined,
    fairValue: row.fair_value ?? undefined,
    discount: row.discount,
    condition: row.condition,
    seller: row.seller,
    location: row.location,
    source: row.source,
    sourceUrl: row.source_url ?? undefined,
    listedAt: row.listed_at ?? undefined,
    aiReasoning: row.ai_reasoning ?? undefined,
    imageUrl: row.image_url ?? undefined,
    matchScore: row.match_score,
    dealScore: row.deal_score ?? undefined,
    daysListed: row.days_listed ?? undefined,
    sellerRating: row.seller_rating ?? undefined,
    hasBox: row.has_box,
    hasPapers: row.has_papers,
    year: row.year ?? undefined,
    payload: (row.payload as Record<string, unknown>) ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toInsert(deal: PersistedDealInput): TableInsert<'deal_matches'> {
  return {
    id: deal.id,
    user_id: deal.userId,
    external_id: deal.externalId ?? deal.id,
    brand: deal.brand,
    model: deal.model,
    reference_number: deal.referenceNumber ?? null,
    price: deal.price,
    currency: deal.currency ?? 'USD',
    market_value: deal.marketValue ?? null,
    fair_value: deal.fairValue ?? null,
    discount: deal.discount,
    condition: deal.condition,
    seller: deal.seller,
    location: deal.location,
    source: deal.source ?? 'chrono24',
    source_url: deal.sourceUrl ?? null,
    listed_at: deal.listedAt ?? null,
    ai_reasoning: deal.aiReasoning ?? null,
    image_url: deal.imageUrl ?? null,
    match_score: deal.matchScore,
    deal_score: deal.dealScore ?? null,
    days_listed: deal.daysListed ?? null,
    seller_rating: deal.sellerRating ?? null,
    has_box: deal.hasBox ?? false,
    has_papers: deal.hasPapers ?? false,
    year: deal.year ?? null,
    payload: deal.payload ?? {},
  }
}

export function getDealCacheKey(userId: string, brand = 'all'): string {
  return createCacheKey('deal-matches', userId, brand)
}

export async function listDeals(client: Pick<SupabaseClient<Database>, 'from'>, userId: string, limit = 50): Promise<PersistedDeal[]> {
  const { data, error } = await client
    .from('deal_matches')
    .select('*')
    .eq('user_id', userId)
    .order('match_score', { ascending: false })
    .order('listed_at', { ascending: false })
    .limit(limit)

  throwIfError(error)
  return (data ?? []).map(mapDeal)
}

export async function upsertDeals(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  deals: PersistedDealInput[],
): Promise<PersistedDeal[]> {
  const payload = deals.map((deal) => toInsert({ ...deal, userId }))
  const { data, error } = await client
    .from('deal_matches')
    .upsert(payload, { onConflict: 'user_id,source,external_id' })
    .select('*')

  throwIfError(error)
  return (data ?? []).map(mapDeal)
}

export async function clearDeals(client: Pick<SupabaseClient<Database>, 'from'>, userId: string): Promise<void> {
  const { error } = await client
    .from('deal_matches')
    .delete()
    .eq('user_id', userId)

  throwIfError(error)
}
