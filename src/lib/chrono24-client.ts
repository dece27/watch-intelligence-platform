import { Deal } from "@/lib/types"

export const CHRONO24_CONFIG_ERROR_MESSAGE =
  "Chrono24 API not configured. Either set VITE_CHRONO24_WRAPPER_BASE_URL at build time, " +
  "or deploy the chrono24-proxy Supabase Edge Function with the CHRONO24_WRAPPER_BASE_URL secret " +
  "pointing to your chrono24-api server."

const trimEnv = (value?: string) => value?.trim() || undefined

const isLocalDevHost = () => {
  if (typeof window === "undefined") return false
  const host = window.location.hostname
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]"
}

// Derive the Supabase Edge Function URL from VITE_SUPABASE_URL so that live
// fetching works in any deployed environment without requiring a build-time
// VITE_CHRONO24_WRAPPER_BASE_URL.  The Edge Function reads CHRONO24_WRAPPER_BASE_URL
// from its server-side Supabase secrets and proxies to the Python chrono24-api server.
const SUPABASE_BASE_URL = trimEnv(import.meta.env.VITE_SUPABASE_URL)
const CHRONO24_EDGE_FN_BASE_URL = SUPABASE_BASE_URL
  ? `${SUPABASE_BASE_URL.replace(/\/$/, "")}/functions/v1/chrono24-proxy`
  : undefined

const resolveChrono24WrapperBaseUrl = () =>
  trimEnv(import.meta.env.VITE_CHRONO24_WRAPPER_BASE_URL)
  || trimEnv(import.meta.env.VITE_CHRONO24_API_BASE_URL)
  || trimEnv(import.meta.env.VITE_CHRONO24_API_HOST)
  || trimEnv(import.meta.env.CHRONO24_WRAPPER_BASE_URL)
  || trimEnv(import.meta.env.CHRONO24_API_BASE_URL)
  || trimEnv(import.meta.env.CHRONO24_API_HOST)
  || (import.meta.env.DEV && isLocalDevHost() ? "http://localhost:8000" : undefined)
  // Fall back to the Supabase Edge Function proxy so live fetching works in all
  // deployed environments without a build-time wrapper URL being required.
  || CHRONO24_EDGE_FN_BASE_URL

const CHRONO24_WRAPPER_BASE_URL = resolveChrono24WrapperBaseUrl()

const resolveApiKey = () => {
  const explicit = trimEnv(import.meta.env.VITE_CHRONO24_WRAPPER_API_KEY)
    || trimEnv(import.meta.env.VITE_CHRONO24_API_KEY)
    || trimEnv(import.meta.env.CHRONO24_WRAPPER_API_KEY)
    || trimEnv(import.meta.env.CHRONO24_API_KEY)
  if (explicit) return explicit
  // When routing through the Supabase Edge Function, authenticate with the
  // Supabase anon key (Bearer scheme).  This is the standard way to call
  // Supabase Edge Functions from browser clients.
  if (CHRONO24_WRAPPER_BASE_URL && CHRONO24_WRAPPER_BASE_URL === CHRONO24_EDGE_FN_BASE_URL) {
    return trimEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)
  }
  return undefined
}

const CHRONO24_WRAPPER_API_KEY = resolveApiKey()
const CHRONO24_WRAPPER_AUTH_HEADER = trimEnv(import.meta.env.VITE_CHRONO24_WRAPPER_AUTH_HEADER)
  || trimEnv(import.meta.env.VITE_CHRONO24_API_AUTH_HEADER)
  || trimEnv(import.meta.env.CHRONO24_WRAPPER_AUTH_HEADER)
  || trimEnv(import.meta.env.CHRONO24_API_AUTH_HEADER)
  || "Authorization"
const CHRONO24_WRAPPER_AUTH_SCHEME = trimEnv(import.meta.env.VITE_CHRONO24_WRAPPER_AUTH_SCHEME)
  || trimEnv(import.meta.env.VITE_CHRONO24_API_AUTH_SCHEME)
  || trimEnv(import.meta.env.CHRONO24_WRAPPER_AUTH_SCHEME)
  || trimEnv(import.meta.env.CHRONO24_API_AUTH_SCHEME)
  || "Bearer"
const CHRONO24_WRAPPER_ENDPOINT = trimEnv(import.meta.env.VITE_CHRONO24_WRAPPER_SEARCH_ENDPOINT)
  || trimEnv(import.meta.env.CHRONO24_WRAPPER_SEARCH_ENDPOINT)
const CHRONO24_WRAPPER_ENDPOINTS = (
  trimEnv(import.meta.env.VITE_CHRONO24_WRAPPER_SEARCH_ENDPOINTS)
  || trimEnv(import.meta.env.CHRONO24_WRAPPER_SEARCH_ENDPOINTS)
)
  ?.split(",")
  .map((endpoint) => endpoint.trim())
  .filter(Boolean)

const DEFAULT_SEARCH_ENDPOINTS = ["/search", "/listings/search", "/api/search"]
const SEARCH_ENDPOINTS = CHRONO24_WRAPPER_ENDPOINTS && CHRONO24_WRAPPER_ENDPOINTS.length > 0
  ? CHRONO24_WRAPPER_ENDPOINTS
  : CHRONO24_WRAPPER_ENDPOINT
    ? [CHRONO24_WRAPPER_ENDPOINT]
    : DEFAULT_SEARCH_ENDPOINTS
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?w=400"
const DEFAULT_UNRANKED_SCORE = 60
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_RATE_LIMIT_RETRY_DELAY_MS = 1500
const REQUEST_TIMEOUT_MS = 15000
const SEARCH_CACHE_PREFIX = "chrono24-search:"
const PREFERRED_ENDPOINT_STORAGE_KEY = "chrono24-preferred-endpoint"
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_GONE = 410
const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_INTERNAL_SERVER_ERROR = 500

export interface Chrono24SearchParams {
  query?: string
  brand?: string
  model?: string
  minPrice?: number
  maxPrice?: number
  page?: number
  limit?: number
}

export const isChrono24WrapperConfigured = Boolean(CHRONO24_WRAPPER_BASE_URL)

function assertChrono24Configured(baseUrl: string | undefined): asserts baseUrl is string {
  if (!baseUrl) {
    throw new Error(CHRONO24_CONFIG_ERROR_MESSAGE)
  }
}

interface CachedChrono24Deals {
  deals: Deal[]
  expiresAt: number
}

class Chrono24HttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null = null
  ) {
    super(`Chrono24 request failed (${status})`)
    this.name = "Chrono24HttpError"
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const ensureTrailingSlash = (value: string) => (value.endsWith("/") ? value : `${value}/`)
const normalizeEndpointPath = (endpoint: string) => endpoint.replace(/^\//, "")

const canUseLocalStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined"

const delay = (ms: number) => new Promise<void>((resolve) => {
  globalThis.setTimeout(resolve, ms)
})

const getSearchCacheKey = (params: Chrono24SearchParams) => {
  const serialized = JSON.stringify(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .sort(([left], [right]) => left.localeCompare(right))
  )

  return `${SEARCH_CACHE_PREFIX}${serialized}`
}

const readCachedDeals = (params: Chrono24SearchParams, returnStale = false): Deal[] | null => {
  if (!canUseLocalStorage()) return null

  try {
    const raw = window.localStorage.getItem(getSearchCacheKey(params))
    if (!raw) return null

    const parsed = JSON.parse(raw) as CachedChrono24Deals
    if (!Array.isArray(parsed.deals)) return null
    if (!returnStale && parsed.expiresAt < Date.now()) return null
    return parsed.deals
  } catch {
    return null
  }
}

const writeCachedDeals = (params: Chrono24SearchParams, deals: Deal[]) => {
  if (!canUseLocalStorage()) return

  try {
    const payload: CachedChrono24Deals = {
      deals,
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    }

    window.localStorage.setItem(getSearchCacheKey(params), JSON.stringify(payload))
  } catch {
    // Ignore storage failures and continue with live fetch results.
  }
}

const getPreferredEndpoint = () => {
  if (!canUseLocalStorage()) return null

  try {
    const stored = window.localStorage.getItem(PREFERRED_ENDPOINT_STORAGE_KEY)
    return stored && SEARCH_ENDPOINTS.includes(stored) ? stored : null
  } catch {
    return null
  }
}

const setPreferredEndpoint = (endpoint: string) => {
  if (!canUseLocalStorage()) return

  try {
    window.localStorage.setItem(PREFERRED_ENDPOINT_STORAGE_KEY, endpoint)
  } catch {
    // Ignore storage failures and continue trying endpoints in memory order.
  }
}

const getEndpointCandidates = () => {
  const preferred = getPreferredEndpoint()
  if (!preferred) return SEARCH_ENDPOINTS
  return [preferred, ...SEARCH_ENDPOINTS.filter((endpoint) => endpoint !== preferred)]
}

const getRequestParams = (params: Chrono24SearchParams) => {
  const requestParams = new URLSearchParams()
  const queryValue = params.query || [params.brand, params.model].filter(Boolean).join(" ").trim() || undefined

  const append = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== null && value !== "") {
      requestParams.set(key, String(value))
    }
  }

  append("query", queryValue)
  append("brand", params.brand)
  append("model", params.model)
  append("min_price", params.minPrice)
  append("max_price", params.maxPrice)
  append("page", params.page)
  append("limit", params.limit)

  return requestParams
}

const parseRetryAfterMs = (retryAfter: string | null) => {
  if (!retryAfter) return null

  const asSeconds = Number(retryAfter)
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1000)
  }

  const asDate = Date.parse(retryAfter)
  if (Number.isNaN(asDate)) return null

  return Math.max(0, asDate - Date.now())
}

const shouldTryAlternativeEndpoint = (status: number) =>
  status !== HTTP_TOO_MANY_REQUESTS && (
    status === HTTP_NOT_FOUND ||
    status === HTTP_METHOD_NOT_ALLOWED ||
    status === HTTP_GONE ||
    status >= HTTP_INTERNAL_SERVER_ERROR
  )

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

const pickFirstArrayString = (source: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = source[key]
    if (!Array.isArray(value)) continue
    for (const entry of value) {
      const stringValue = toStringValue(entry)
      if (stringValue) return stringValue
    }
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

  const price = pickNumber(item, ["price", "askingPrice", "priceAmount", "amount", "listing_price"])
  if (price === null || price <= 0) return null

  const marketValue = pickNumber(item, ["marketValue", "estimatedMarketValue", "estimatedValue"])
  const fairValue = pickNumber(item, ["fairValue", "estimatedFairValue"]) ?? marketValue ?? null
  const discount = fairValue && fairValue > 0 ? Math.round(((fairValue - price) / fairValue) * 100) : 0
  const imageUrl = pickString(item, ["imageUrl", "image", "thumbnailUrl", "image_url"])
    || pickFirstArrayString(item, ["image_urls", "images"])
    || FALLBACK_IMAGE
  const listedAt = pickString(item, ["listedAt", "listingDate", "createdAt", "publishedAt", "created_at"])
  const sourceUrl = pickString(item, ["url", "listingUrl", "sourceUrl", "href", "link"])
  const scopeOfDelivery = pickString(item, ["scope_of_delivery"])?.toLowerCase() || ""
  const hasBoxFromScope = /\bbox\b/.test(scopeOfDelivery)
  const hasPapersFromScope = /\bpapers?\b/.test(scopeOfDelivery)
  let stableUrlIdentifier: string | null = null
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl)
      const pathSegment = parsed.pathname.split("/").filter(Boolean).pop()
      stableUrlIdentifier = pathSegment || `${parsed.origin}${parsed.pathname}`
    } catch {
      stableUrlIdentifier = sourceUrl.split(/[?#]/)[0] || null
    }
  }
  const listingIdentifier = pickString(item, ["id", "listingId", "uuid"])
    || stableUrlIdentifier
    || pickString(item, ["referenceNumber", "reference", "ref", "slug", "title"])
    || `listing-${index}-${price}`

  return {
    id: `chrono24-${listingIdentifier}`,
    brand: pickString(item, ["brand", "manufacturer", "brand_name"]) || "Unknown",
    model: pickString(item, ["model", "name", "title"]) || "Unknown Model",
    referenceNumber: pickString(item, ["referenceNumber", "reference", "ref", "reference_number"]) || undefined,
    price,
    currency: pickString(item, ["currency", "currencyCode"]) || "USD",
    marketValue: marketValue ?? undefined,
    fairValue: fairValue ?? undefined,
    discount,
    condition: pickString(item, ["condition", "conditionText"]) || "Good",
    seller: pickString(item, ["seller", "dealerName", "merchant", "merchant_name"]) || "Chrono24 Seller",
    location: pickString(item, ["location", "country", "city"]) || "Unknown",
    source: "Chrono24",
    sourceUrl: sourceUrl || undefined,
    listedAt: listedAt || undefined,
    imageUrl,
    matchScore: DEFAULT_UNRANKED_SCORE,
    dealScore: DEFAULT_UNRANKED_SCORE,
    daysListed: pickNumber(item, ["daysListed", "listingAgeDays"]) || undefined,
    sellerRating: pickNumber(item, ["sellerRating", "dealerRating", "merchant_rating"]) || undefined,
    hasBox: Boolean(item.hasBox ?? item.box) || hasBoxFromScope,
    hasPapers: Boolean(item.hasPapers ?? item.papers) || hasPapersFromScope,
    year: pickNumber(item, ["year", "productionYear", "year_of_production"]) || undefined,
  }
}

const requestEndpoint = async (
  endpoint: string,
  params: Chrono24SearchParams
): Promise<unknown> => {
  assertChrono24Configured(CHRONO24_WRAPPER_BASE_URL)

  const baseUrl = ensureTrailingSlash(CHRONO24_WRAPPER_BASE_URL)
  const url = new URL(normalizeEndpointPath(endpoint), baseUrl)
  const requestParams = getRequestParams(params)
  requestParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })

  const headers: Record<string, string> = {
    Accept: "application/json",
  }

  if (CHRONO24_WRAPPER_API_KEY) {
    const isAuthorizationHeader = CHRONO24_WRAPPER_AUTH_HEADER.toLowerCase() === "authorization"
    headers[CHRONO24_WRAPPER_AUTH_HEADER] = isAuthorizationHeader
      ? `${CHRONO24_WRAPPER_AUTH_SCHEME} ${CHRONO24_WRAPPER_API_KEY}`
      : CHRONO24_WRAPPER_API_KEY
  }

  let attemptedRetry = false

  while (true) {
    const controller = new AbortController()
    const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response: Response

    try {
      response = await fetch(url.toString(), { headers, signal: controller.signal })
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Chrono24 request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)
      }
      throw error
    } finally {
      globalThis.clearTimeout(timeoutId)
    }

    if (response.ok) {
      return response.json()
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"))
    if (
      response.status === HTTP_TOO_MANY_REQUESTS &&
      !attemptedRetry &&
      retryAfterMs !== null &&
      retryAfterMs <= MAX_RATE_LIMIT_RETRY_DELAY_MS
    ) {
      attemptedRetry = true
      await delay(retryAfterMs)
      continue
    }

    throw new Chrono24HttpError(response.status, retryAfterMs)
  }
}

/**
 * Always attempt to fetch live Chrono24 data. When VITE_CHRONO24_WRAPPER_BASE_URL is not
 * configured the requests will fail gracefully and the caller falls back to static data.
 * Setting this to `true` ensures that:
 *   1. The loading indicator is always shown while the API is attempted.
 *   2. The Refresh button triggers a real async round-trip, giving visible feedback.
 *   3. The Deal of the Day section can show a meaningful fallback after a failed attempt.
 */
export const hasChrono24Credentials = true

/**
 * Clear all Chrono24 search results stored in localStorage so the next call to
 * `searchChrono24Deals` fetches fresh data instead of serving a cached response.
 * Call this before a user-triggered refresh to bypass the 10-minute cache TTL.
 */
export const clearChrono24SearchCache = (): void => {
  if (!canUseLocalStorage()) return
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(SEARCH_CACHE_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // Ignore storage errors — the live fetch will proceed regardless.
  }
}

export async function searchChrono24Deals(params: Chrono24SearchParams): Promise<Deal[]> {
  // Fast-fail with a clear message when no API wrapper is configured so the
  // error shown in the UI is concise rather than the same message repeated
  // once per endpoint candidate.
  assertChrono24Configured(CHRONO24_WRAPPER_BASE_URL)

  const cachedDeals = readCachedDeals(params)
  if (cachedDeals && cachedDeals.length > 0) {
    return cachedDeals
  }

  const staleCachedDeals = readCachedDeals(params, true)
  const attemptedErrors: string[] = []
  let rateLimited = false

  for (const endpoint of getEndpointCandidates()) {
    try {
      const payload = await requestEndpoint(endpoint, params)
      const items = getArrayPayload(payload)
      const mapped = items
        .map((item, index) => mapChrono24Listing(item, index))
        .filter((deal): deal is Deal => Boolean(deal))

      if (mapped.length > 0) {
        setPreferredEndpoint(endpoint)
        writeCachedDeals(params, mapped)
        return mapped
      }
    } catch (error) {
      if (error instanceof Chrono24HttpError) {
        attemptedErrors.push(error.message)

        if (error.status === HTTP_TOO_MANY_REQUESTS) {
          rateLimited = true
          break
        }

        if (!shouldTryAlternativeEndpoint(error.status)) {
          break
        }

        continue
      }

      attemptedErrors.push(error instanceof Error ? error.message : String(error))
    }
  }

  if (rateLimited && staleCachedDeals && staleCachedDeals.length > 0) {
    // When Chrono24 throttles requests, reuse the most recent cached response
    // so the Deals page still shows data instead of failing hard.
    return staleCachedDeals
  }

  if (rateLimited) {
    throw new Error("Chrono24 rate limit reached (429). Requests are now throttled—please retry in a few minutes.")
  }

  if (attemptedErrors.length > 0) {
    throw new Error(`Chrono24 API unavailable: ${attemptedErrors.join("; ")}`)
  }

  return []
}
