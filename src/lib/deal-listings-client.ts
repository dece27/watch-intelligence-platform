import { searchDealListings } from '@/lib/db/deals'
import { getSupabaseClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client'
import type { Deal } from '@/lib/types'

// Chrono24 data is fetched by scripts/fetch-chrono24.py (GitHub Actions)
// and stored in Supabase → market_price_history + deal_listings tables.
// Read data from Supabase — do not call Chrono24 directly from this file.

export const DEAL_LISTINGS_CONFIG_ERROR_MESSAGE =
  'Supabase browser env is not configured. Configure Supabase access to read synced deal listings.'

export interface DealListingQuery {
  brands?: string[]
  limit?: number
  maxPrice?: number
}

const DEFAULT_DEAL_SELLER = 'Marketplace Seller'
const DEFAULT_DEAL_CONDITION = 'Good'

const toConditionLabel = (value?: string) => value?.trim() || DEFAULT_DEAL_CONDITION

const toDeal = (listing: Awaited<ReturnType<typeof searchDealListings>>[number]): Deal => {
  const fairValue = listing.fairValue > 0 ? listing.fairValue : listing.askingPrice
  const discount = fairValue > 0
    ? Math.max(0, Math.round(((fairValue - listing.askingPrice) / fairValue) * 100))
    : 0

  return {
    id: listing.id,
    brand: listing.brand,
    model: listing.model || listing.reference,
    referenceNumber: listing.reference || undefined,
    price: listing.askingPrice,
    currency: listing.currency || 'USD',
    marketValue: fairValue,
    fairValue,
    discount,
    condition: toConditionLabel(listing.condition),
    seller: DEFAULT_DEAL_SELLER,
    location: listing.location || 'Unknown',
    source: listing.source ? listing.source.toUpperCase() : 'CHRONO24',
    sourceUrl: listing.externalUrl || undefined,
    listedAt: listing.updatedAt || listing.createdAt,
    imageUrl: listing.photoUrl || undefined,
    matchScore: listing.dealScore ?? 60,
    dealScore: listing.dealScore ?? undefined,
    daysListed: listing.daysListed ?? undefined,
    sellerRating: listing.sellerRating ?? undefined,
    hasBox: listing.hasBox,
    hasPapers: listing.hasPapers,
    year: listing.year ?? undefined,
  }
}

export const areDealListingsConfigured = hasSupabaseBrowserEnv()

export async function fetchDealListings({ brands, limit = 24, maxPrice }: DealListingQuery = {}): Promise<Deal[]> {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error(DEAL_LISTINGS_CONFIG_ERROR_MESSAGE)
  }

  const listings = await searchDealListings(getSupabaseClient(), {
    brands,
    limit,
    maxAskingPrice: maxPrice,
  })

  return listings.map(toDeal)
}
