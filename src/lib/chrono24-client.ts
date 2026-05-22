import { Deal } from "@/lib/types"

const CHRONO24_BASE_URL = import.meta.env.VITE_CHRONO24_API_BASE_URL?.trim() || "https://chrono24.p.rapidapi.com"
const CHRONO24_API_KEY = import.meta.env.VITE_CHRONO24_API_KEY?.trim()
const CHRONO24_API_HOST = import.meta.env.VITE_CHRONO24_API_HOST?.trim() || "chrono24.p.rapidapi.com"

const SEARCH_ENDPOINTS = ["/listings/search", "/search", "/api/search"]
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?w=400"
const DEFAULT_UNRANKED_SCORE = 60

export interface Chrono24SearchParams {
  query?: string
  brand?: string
  model?: string
  minPrice?: number
  maxPrice?: number
  page?: number
  limit?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

const pickString = (source: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = toStringValue(source[key])
    if (value) return value
  }
  return null
}

const pickNumber = (source: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = toNumber(source[key])
    if (value !== null) return value
  }
  return null
}

const getArrayPayload = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []

  const keys = ["listings", "results", "items", "data", "offers"]
  for (const key of keys) {
    const candidate = payload[key]
    if (Array.isArray(candidate)) return candidate
  }

  const dataNode = payload.data
  if (isRecord(dataNode)) {
    for (const key of keys) {
      const candidate = dataNode[key]
      if (Array.isArray(candidate)) return candidate
    }
  }

  return []
}

const mapChrono24Listing = (item: unknown, index: number): Deal | null => {
  if (!isRecord(item)) return null

  const price = pickNumber(item, ["price", "askingPrice", "priceAmount", "amount"])
  if (price === null || price <= 0) return null

  const marketValue = pickNumber(item, ["marketValue", "estimatedMarketValue", "estimatedValue"])
  const fairValue = pickNumber(item, ["fairValue", "estimatedFairValue"]) ?? marketValue ?? price
  const discount = fairValue > 0 ? Math.max(0, Math.round(((fairValue - price) / fairValue) * 100)) : 0
  const imageUrl = pickString(item, ["imageUrl", "image", "thumbnailUrl", "image_url"]) || FALLBACK_IMAGE
  const listedAt = pickString(item, ["listedAt", "listingDate", "createdAt", "publishedAt"])
  const sourceUrl = pickString(item, ["url", "listingUrl", "sourceUrl"])

  return {
    id: pickString(item, ["id", "listingId", "uuid"]) || `chrono24-${index}`,
    brand: pickString(item, ["brand", "manufacturer"]) || "Unknown",
    model: pickString(item, ["model", "name", "title"]) || "Unknown Model",
    referenceNumber: pickString(item, ["referenceNumber", "reference", "ref"]),
    price,
    currency: pickString(item, ["currency", "currencyCode"]) || "USD",
    marketValue: marketValue ?? fairValue,
    fairValue,
    discount,
    condition: pickString(item, ["condition", "conditionText"]) || "Good",
    seller: pickString(item, ["seller", "dealerName", "merchant"]) || "Chrono24 Seller",
    location: pickString(item, ["location", "country", "city"]) || "Unknown",
    source: "Chrono24",
    sourceUrl,
    listedAt: listedAt || undefined,
    imageUrl,
    matchScore: DEFAULT_UNRANKED_SCORE,
    dealScore: DEFAULT_UNRANKED_SCORE,
    daysListed: pickNumber(item, ["daysListed", "listingAgeDays"]) || undefined,
    sellerRating: pickNumber(item, ["sellerRating", "dealerRating"]) || undefined,
    hasBox: Boolean(item.hasBox ?? item.box),
    hasPapers: Boolean(item.hasPapers ?? item.papers),
    year: pickNumber(item, ["year", "productionYear"]) || undefined,
  }
}

const requestEndpoint = async (
  endpoint: string,
  params: Chrono24SearchParams
): Promise<unknown> => {
  const url = new URL(`${CHRONO24_BASE_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value))
    }
  })

  const headers: Record<string, string> = {
    Accept: "application/json",
  }

  if (CHRONO24_API_KEY) {
    headers["X-RapidAPI-Key"] = CHRONO24_API_KEY
    headers["X-RapidAPI-Host"] = CHRONO24_API_HOST
  }

  const response = await fetch(url.toString(), { headers })
  if (!response.ok) {
    throw new Error(`Chrono24 request failed (${response.status})`)
  }

  return response.json()
}

export const hasChrono24Credentials = Boolean(CHRONO24_API_KEY)

export async function searchChrono24Deals(params: Chrono24SearchParams): Promise<Deal[]> {
  const attemptedErrors: string[] = []

  for (const endpoint of SEARCH_ENDPOINTS) {
    try {
      const payload = await requestEndpoint(endpoint, params)
      const items = getArrayPayload(payload)
      const mapped = items
        .map((item, index) => mapChrono24Listing(item, index))
        .filter((deal): deal is Deal => Boolean(deal))

      if (mapped.length > 0) {
        return mapped
      }
    } catch (error) {
      attemptedErrors.push(error instanceof Error ? error.message : String(error))
    }
  }

  if (attemptedErrors.length > 0) {
    throw new Error(`Chrono24 API unavailable: ${attemptedErrors.join("; ")}`)
  }

  return []
}
