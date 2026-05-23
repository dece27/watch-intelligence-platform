import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, TableInsert, TableRow } from '@/lib/supabase/types'
import { createCacheKey } from '@/lib/cache/strategy'

export interface DealListingRecord {
  id: string
  brand: string
  model?: string
  reference: string
  year?: number
  condition?: Database['public']['Enums']['watch_condition']
  askingPrice: number
  fairValue: number
  currency?: string
  sellerRating?: number
  daysListed?: number
  location?: string
  hasBox: boolean
  hasPapers: boolean
  source?: string
  externalUrl?: string
  photoUrl?: string
  dealScore?: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface DealListingInput extends Omit<DealListingRecord, 'dealScore' | 'createdAt' | 'updatedAt'> {
  id?: string
}

export interface SavedDealRecord {
  id: string
  userId: string
  listingId?: string
  listingSnapshot: Json
  savedAt: string
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapListing(row: TableRow<'deal_listings'>): DealListingRecord {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model ?? undefined,
    reference: row.reference,
    year: row.year ?? undefined,
    condition: row.condition ?? undefined,
    askingPrice: row.asking_price,
    fairValue: row.fair_value,
    currency: row.currency ?? undefined,
    sellerRating: row.seller_rating ?? undefined,
    daysListed: row.days_listed ?? undefined,
    location: row.location ?? undefined,
    hasBox: row.has_box ?? false,
    hasPapers: row.has_papers ?? false,
    source: row.source ?? undefined,
    externalUrl: row.external_url ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    dealScore: row.deal_score ?? undefined,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSavedDeal(row: TableRow<'saved_deals'>): SavedDealRecord {
  return {
    id: row.id,
    userId: row.user_id,
    listingId: row.listing_id ?? undefined,
    listingSnapshot: row.listing_snapshot,
    savedAt: row.saved_at,
  }
}

function toInsert(listing: DealListingInput): TableInsert<'deal_listings'> {
  return {
    id: listing.id,
    brand: listing.brand,
    model: listing.model ?? null,
    reference: listing.reference,
    year: listing.year ?? null,
    condition: listing.condition ?? null,
    asking_price: listing.askingPrice,
    fair_value: listing.fairValue,
    currency: listing.currency ?? 'USD',
    seller_rating: listing.sellerRating ?? null,
    days_listed: listing.daysListed ?? null,
    location: listing.location ?? null,
    has_box: listing.hasBox,
    has_papers: listing.hasPapers,
    source: listing.source ?? 'mock',
    external_url: listing.externalUrl ?? null,
    photo_url: listing.photoUrl ?? null,
    is_active: listing.isActive,
  }
}

export function getDealCacheKey(userId: string, brand = 'all'): string {
  return createCacheKey('deal-matches', userId, brand)
}

export async function listDealListings(
  client: Pick<SupabaseClient<Database>, 'from'>,
  limit = 50,
): Promise<DealListingRecord[]> {
  const { data, error } = await client
    .from('deal_listings')
    .select('*')
    .eq('is_active', true)
    .order('deal_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  throwIfError(error)
  return (data ?? []).map(mapListing)
}

export async function upsertDealListings(
  client: Pick<SupabaseClient<Database>, 'from'>,
  listings: DealListingInput[],
): Promise<DealListingRecord[]> {
  const { data, error } = await client
    .from('deal_listings')
    .upsert(listings.map(toInsert), { onConflict: 'id' })
    .select('*')

  throwIfError(error)
  return (data ?? []).map(mapListing)
}

export async function saveDeal(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  listingId: string,
  listingSnapshot: Json,
): Promise<SavedDealRecord> {
  const { data, error } = await client
    .from('saved_deals')
    .upsert({ user_id: userId, listing_id: listingId, listing_snapshot: listingSnapshot }, { onConflict: 'user_id,listing_id' })
    .select('*')
    .single()

  throwIfError(error)
  return mapSavedDeal(data)
}

export async function listSavedDeals(client: Pick<SupabaseClient<Database>, 'from'>, userId: string): Promise<SavedDealRecord[]> {
  const { data, error } = await client
    .from('saved_deals')
    .select('*')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false })

  throwIfError(error)
  return (data ?? []).map(mapSavedDeal)
}

export async function removeSavedDeal(client: Pick<SupabaseClient<Database>, 'from'>, userId: string, listingId: string): Promise<void> {
  const { error } = await client
    .from('saved_deals')
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId)

  throwIfError(error)
}
