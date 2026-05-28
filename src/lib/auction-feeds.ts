export interface AuctionResult {
  house: string
  date: string
  lot: string
  result: number
  estLow?: number
  estHigh?: number
  notes: string
  sourceUrl?: string
  reference?: string
}

interface FetchAuctionResultsOptions {
  references: string[]
  limit?: number
}

interface FeedConfig {
  house: string
  url: string
}

const DEFAULT_RESULT_LIMIT = 8
const RECENT_WINDOW_MONTHS = 12
const AUCTION_CACHE_KEY_PREFIX = 'auction_results_v1_'
const AUCTION_CACHE_TTL_MS = 1000 * 60 * 20
const AUCTION_CACHE_STALE_TTL_MS = 1000 * 60 * 60 * 8
const auctionMemoryCache = new Map<string, { expiresAt: number; cachedAt: number; data: AuctionResult[] }>()
const auctionRefreshInflight = new Map<string, Promise<AuctionResult[]>>()

// Optional env-var-configured custom feed URLs (take precedence over the built-in endpoints).
const CUSTOM_FEED_CONFIGS: FeedConfig[] = [
  { house: 'Phillips', url: import.meta.env.VITE_PHILLIPS_AUCTION_FEED_URL?.trim() || '' },
  { house: "Christie's", url: import.meta.env.VITE_CHRISTIES_AUCTION_FEED_URL?.trim() || '' },
].filter((config) => config.url.length > 0)

const CHRISTIES_BASE_URL = 'https://www.christies.com'
const CHRISTIES_LOTCARDS_PATH = '/api/discoverywebsite/search/lotcards'

const PHILLIPS_BASE_URL = 'https://www.phillips.com'
const PHILLIPS_SEARCH_PATH = '/api/search'

type UnknownRecord = Record<string, unknown>

interface AuctionCacheRecord {
  cachedAt: string
  data: AuctionResult[]
}

type AuctionCacheState = 'fresh' | 'stale' | 'expired'

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function buildAuctionCacheKey(references: string[], limit: number): string {
  const normalizedRefs = references.map((reference) => reference.trim().toLowerCase()).sort().join('|')
  return `${AUCTION_CACHE_KEY_PREFIX}${normalizedRefs}_${limit}`
}

function resolveAuctionCacheState(cachedAt: number): AuctionCacheState {
  const ageMs = Date.now() - cachedAt
  if (ageMs <= AUCTION_CACHE_TTL_MS) return 'fresh'
  if (ageMs <= AUCTION_CACHE_STALE_TTL_MS) return 'stale'
  return 'expired'
}

async function readAuctionCache(cacheKey: string): Promise<{ state: AuctionCacheState; data: AuctionResult[] | null }> {
  const inMemory = auctionMemoryCache.get(cacheKey)
  if (inMemory) {
    const state = inMemory.expiresAt > Date.now() ? 'fresh' : 'stale'
    return { state, data: inMemory.data }
  }

  if (!isBrowser()) return { state: 'expired', data: null }

  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) return { state: 'expired', data: null }
    const parsed = JSON.parse(raw) as AuctionCacheRecord
    if (!Array.isArray(parsed?.data)) return { state: 'expired', data: null }
    const cachedAt = Date.parse(parsed.cachedAt)
    if (!Number.isFinite(cachedAt)) return { state: 'expired', data: null }
    const state = resolveAuctionCacheState(cachedAt)
    if (state === 'expired') return { state, data: null }
    auctionMemoryCache.set(cacheKey, {
      expiresAt: cachedAt + AUCTION_CACHE_TTL_MS,
      cachedAt,
      data: parsed.data,
    })
    return { state, data: parsed.data }
  } catch {
    return { state: 'expired', data: null }
  }
}

async function writeAuctionCache(cacheKey: string, data: AuctionResult[]): Promise<void> {
  const cachedAt = Date.now()
  auctionMemoryCache.set(cacheKey, { expiresAt: cachedAt + AUCTION_CACHE_TTL_MS, cachedAt, data })
  if (!isBrowser()) return
  try {
    const payload: AuctionCacheRecord = {
      cachedAt: new Date(cachedAt).toISOString(),
      data,
    }
    window.localStorage.setItem(cacheKey, JSON.stringify(payload))
  } catch {
    // no-op
  }
}

function isTrustedHost(hostname: string, trustedDomain: string): boolean {
  const normalizedHost = hostname.toLowerCase()
  return normalizedHost === trustedDomain || normalizedHost.endsWith(`.${trustedDomain}`)
}

function tryParseUrl(url: string): URL | undefined {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

// Include Christie's-specific price field names alongside generic ones.
const VALUE_KEYS = [
  'sold_for',
  'soldFor',
  'sold_price',
  'soldPrice',
  'result',
  'hammerPrice',
  'realizedPrice',
  'price',
  'amount',
  'priceRealised_USD',
  'priceRealised',
  'price_realised',
  'realised',
]
const EST_LOW_KEYS = ['estLow', 'estimateLow', 'lowEstimate', 'estimate_low']
const EST_HIGH_KEYS = ['estHigh', 'estimateHigh', 'highEstimate', 'estimate_high']
// Include Christie's sale_date_ISO / sale_date fields alongside generic ones.
const DATE_KEYS = [
  'date',
  'saleDate',
  'auctionDate',
  'publishedAt',
  'pubDate',
  'updatedAt',
  'sale_date_ISO',
  'sale_date',
]
const LOT_KEYS = ['lot', 'title', 'name', 'lotTitle', 'reference']
const NOTES_KEYS = ['notes', 'description', 'summary']
const URL_KEYS = ['url', 'link', 'sourceUrl', 'detailUrl', 'lot_url', 'lotUrl']
const REFERENCE_KEYS = ['reference', 'ref', 'referenceNumber']

function getValueKeysForHouse(house: string): string[] {
  const normalizedHouse = house.toLowerCase()
  if (normalizedHouse.includes('christie')) {
    return [
      'price_realised',
      'priceRealised',
      'priceRealised_USD',
      'realised',
      'realizedPrice',
      'soldPrice',
      'sold_for',
      'soldFor',
      'hammerPrice',
      'result',
      'price',
    ]
  }
  if (normalizedHouse.includes('phillips')) {
    return [
      'sold_for',
      'soldFor',
      'sold_price',
      'soldPrice',
      'realizedPrice',
      'price_realised',
      'priceRealised',
      'priceRealised_USD',
      'hammerPrice',
      'result',
      'price',
      'amount',
    ]
  }
  return VALUE_KEYS
}

function getUrlKeysForHouse(house: string): string[] {
  const normalizedHouse = house.toLowerCase()
  if (normalizedHouse.includes('christie')) {
    return ['url', 'detailUrl', 'lot_url', 'lotUrl', 'link', 'sourceUrl']
  }
  if (normalizedHouse.includes('phillips')) {
    return ['detailUrl', 'url', 'link', 'sourceUrl', 'lot_url', 'lotUrl']
  }
  return URL_KEYS
}

function getAllStringValues(record: UnknownRecord, keys: string[]): string[] {
  const uniqueValues = new Set<string>()
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.length > 0) {
        uniqueValues.add(trimmed)
      }
    }
  }
  return Array.from(uniqueValues)
}

function getBestUrlValue(record: UnknownRecord, house: string): string {
  const candidates = getAllStringValues(record, getUrlKeysForHouse(house))
  if (candidates.length === 0) {
    return ''
  }

  const normalizedHouse = house.toLowerCase()
  if (normalizedHouse.includes('christie')) {
    const exactLotPathCandidate = candidates.find((value) => /(?:^|\/)lot\/lot-\d+/i.test(value))
    if (exactLotPathCandidate) {
      return exactLotPathCandidate
    }

    const lotPathCandidate = candidates.find((value) => value.toLowerCase().includes('/lot/'))
    if (lotPathCandidate) {
      return lotPathCandidate
    }
  }

  if (normalizedHouse.includes('phillips')) {
    const detailPathCandidate = candidates.find((value) => value.toLowerCase().includes('/detail/'))
    if (detailPathCandidate) {
      return detailPathCandidate
    }
  }

  return candidates[0]
}

function extractNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.replace(/,/g, '')
  const directNumber = Number(normalized)
  if (!Number.isNaN(directNumber)) {
    return directNumber
  }

  const priceMatch = value.match(/(?:US\$|\$|USD|HK\$|CHF|GBP|£|€)\s*([\d,.]+)/i)
  if (priceMatch?.[1]) {
    const parsed = Number(priceMatch[1].replace(/,/g, ''))
    return Number.isNaN(parsed) ? undefined : parsed
  }

  return undefined
}

function extractEstimateRange(text: string): { low?: number; high?: number } {
  const match = text.match(
    /(estimate|est\.?)\s*(?::|-|–)?\s*(?:US\$|\$|USD|HK\$|CHF|GBP|£|€)?\s*([\d,.]+)\s*(?:-|–|to)\s*(?:US\$|\$|USD|HK\$|CHF|GBP|£|€)?\s*([\d,.]+)/i
  )

  if (!match) {
    return {}
  }

  const low = extractNumber(match[2])
  const high = extractNumber(match[3])
  return { low, high }
}

function getFirstValue(record: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key]
    }
  }
  return undefined
}

function getStringValue(record: UnknownRecord, keys: string[]): string {
  const value = getFirstValue(record, keys)
  return typeof value === 'string' ? value.trim() : ''
}

function parseDateToTimestamp(dateValue: string): number | null {
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.getTime()
}

function getRecentWindowStartTimestamp(): number {
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - RECENT_WINDOW_MONTHS)
  return cutoffDate.getTime()
}

/**
 * Resolves a potentially-relative lot URL to an absolute URL using the known
 * base URL of the auction house. Christie's and Phillips APIs return relative
 * paths (e.g. "/en/lot/...") that must be combined with their origin.
 */
function resolveSourceUrl(rawUrl: string, house: string): string | undefined {
  if (!rawUrl) return undefined
  const trimmed = rawUrl.trim()
  const normalizedHouse = house.toLowerCase()
  const normalizedPath =
    trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `/${trimmed}`

  const withChristiesLocalePath = (path: string): string =>
    path.startsWith('/lot/lot-') ? `/en${path}` : path

  if (normalizedPath.startsWith('https://') || normalizedPath.startsWith('http://')) {
    if (normalizedHouse.includes('christie')) {
      const parsed = tryParseUrl(normalizedPath)
      if (parsed && isTrustedHost(parsed.hostname, 'christies.com')) {
        parsed.pathname = withChristiesLocalePath(parsed.pathname)
        return parsed.toString()
      }
    }
    return normalizedPath
  }

  if (normalizedPath.startsWith('/')) {
    if (normalizedHouse.includes('christie')) {
      return `${CHRISTIES_BASE_URL}${withChristiesLocalePath(normalizedPath)}`
    }
    if (normalizedHouse.includes('phillips')) {
      return `${PHILLIPS_BASE_URL}${normalizedPath}`
    }
  }

  return undefined
}

function normalizeJsonItem(item: UnknownRecord, house: string): AuctionResult | null {
  const lot = getStringValue(item, LOT_KEYS)
  if (!lot) {
    return null
  }

  const notes = getStringValue(item, NOTES_KEYS)
  const dateString = getStringValue(item, DATE_KEYS)
  const reference = getStringValue(item, REFERENCE_KEYS)
  const sourceUrl = resolveSourceUrl(getBestUrlValue(item, house), house)

  const result = extractNumber(getFirstValue(item, getValueKeysForHouse(house)))
  if (result === undefined) {
    return null
  }

  let estLow = extractNumber(getFirstValue(item, EST_LOW_KEYS))
  let estHigh = extractNumber(getFirstValue(item, EST_HIGH_KEYS))

  if (estLow === undefined || estHigh === undefined) {
    const parsed = extractEstimateRange(notes)
    estLow = estLow ?? parsed.low
    estHigh = estHigh ?? parsed.high
  }

  return {
    house,
    date: dateString || 'Unknown date',
    lot,
    result,
    estLow,
    estHigh,
    notes: notes || 'Live auction feed',
    sourceUrl: sourceUrl || undefined,
    reference: reference || undefined,
  }
}

function normalizeXmlItems(rawXml: string, house: string): AuctionResult[] {
  const parser = new DOMParser()
  const xml = parser.parseFromString(rawXml, 'text/xml')
  const entries = Array.from(xml.querySelectorAll('item, entry'))

  return entries
    .map((entry) => {
      const title = entry.querySelector('title')?.textContent?.trim() || ''
      const description = entry.querySelector('description, summary, content')?.textContent?.trim() || ''
      const date =
        entry.querySelector('pubDate, published, updated, dc\\:date')?.textContent?.trim() || 'Unknown date'
      const linkElement = entry.querySelector('link')
      const sourceUrl = linkElement?.getAttribute('href') || linkElement?.textContent?.trim() || undefined
      const result = extractNumber(title) ?? extractNumber(description)
      if (!title || result === undefined) {
        return null
      }

      const estimateRange = extractEstimateRange(description)

      return {
        house,
        date,
        lot: title,
        result,
        estLow: estimateRange.low ?? undefined,
        estHigh: estimateRange.high ?? undefined,
        notes: description || 'Live auction feed',
        sourceUrl,
      } satisfies AuctionResult
    })
    .filter((item): item is NonNullable<typeof item> => item !== null) as AuctionResult[]
}

function extractItemsArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  const record = payload as UnknownRecord
  // Christie's wraps results in a "lots" key; other feeds use "items" or "results".
  if (Array.isArray(record.lots)) {
    return record.lots as unknown[]
  }

  if (Array.isArray(record.results)) {
    return record.results as unknown[]
  }

  if (Array.isArray(record.items)) {
    return record.items as unknown[]
  }

  return []
}

async function fetchFeed(feed: FeedConfig): Promise<AuctionResult[]> {
  const response = await fetch(feed.url)
  if (!response.ok) {
    throw new Error(`${feed.house} feed request failed with status ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const payload: unknown = await response.json()
    const rawItems = extractItemsArray(payload)

    return rawItems
      .filter((item): item is UnknownRecord => Boolean(item && typeof item === 'object'))
      .map((item) => normalizeJsonItem(item, feed.house))
      .filter((item): item is AuctionResult => item !== null)
  }

  const body = await response.text()

  if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
    try {
      const payload = JSON.parse(body) as unknown
      const rawItems = extractItemsArray(payload)

      return rawItems
        .filter((item): item is UnknownRecord => Boolean(item && typeof item === 'object'))
        .map((item) => normalizeJsonItem(item, feed.house))
        .filter((item): item is AuctionResult => item !== null)
    } catch {
      // Ignore JSON parse failures and continue to XML parsing.
    }
  }

  return normalizeXmlItems(body, feed.house)
}

/**
 * Fetches recent sold watch lots from the Christie's internal search API.
 * Searches using the provided reference terms and maps each lot's relative
 * URL to an absolute Christie's detail-page URL.
 */
async function fetchChristiesResults(references: string[]): Promise<AuctionResult[]> {
  const url = new URL(`${CHRISTIES_BASE_URL}${CHRISTIES_LOTCARDS_PATH}`)
  url.searchParams.set('keyword', references.join(' '))
  url.searchParams.set('status', 'sold')
  url.searchParams.set('page', '1')
  url.searchParams.set('pageSize', '40')

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`Christie's API request failed with status ${response.status}`)
  }

  const payload: unknown = await response.json()
  const rawItems = extractItemsArray(payload)

  return rawItems
    .filter((item): item is UnknownRecord => Boolean(item && typeof item === 'object'))
    .map((item) => normalizeJsonItem(item, "Christie's"))
    .filter((item): item is AuctionResult => item !== null)
}

/**
 * Fetches recent sold watch lots from the Phillips internal search API.
 * Searches using the provided reference terms and maps each lot's relative
 * URL to an absolute Phillips detail-page URL.
 */
async function fetchPhillipsResults(references: string[]): Promise<AuctionResult[]> {
  const url = new URL(`${PHILLIPS_BASE_URL}${PHILLIPS_SEARCH_PATH}`)
  url.searchParams.set('q', references.join(' '))
  url.searchParams.set('status', 'sold')
  url.searchParams.set('page', '1')
  url.searchParams.set('pageSize', '40')

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`Phillips API request failed with status ${response.status}`)
  }

  const payload: unknown = await response.json()
  const rawItems = extractItemsArray(payload)

  return rawItems
    .filter((item): item is UnknownRecord => Boolean(item && typeof item === 'object'))
    .map((item) => normalizeJsonItem(item, 'Phillips'))
    .filter((item): item is AuctionResult => item !== null)
}

function normalizeAndFilter(
  items: AuctionResult[],
  references: string[],
  limit: number
): AuctionResult[] {
  const lowerCaseRefs = references.map((reference) => reference.toLowerCase())
  const recentWindowStartTimestamp = getRecentWindowStartTimestamp()

  return items
    .filter((item) => {
      const normalizedHouse = item.house.toLowerCase()
      if (!normalizedHouse.includes('christie') && !normalizedHouse.includes('phillips')) {
        return false
      }

      const itemTimestamp = parseDateToTimestamp(item.date)
      if (itemTimestamp === null || itemTimestamp < recentWindowStartTimestamp) {
        return false
      }

      const searchableText = `${item.lot} ${item.notes} ${item.reference || ''}`.toLowerCase()
      return lowerCaseRefs.some((reference) => searchableText.includes(reference))
    })
    .sort((a, b) => {
      const bTime = parseDateToTimestamp(b.date) ?? Number.NEGATIVE_INFINITY
      const aTime = parseDateToTimestamp(a.date) ?? Number.NEGATIVE_INFINITY
      if (bTime !== aTime) {
        return bTime - aTime
      }
      return a.lot.localeCompare(b.lot)
    })
    .slice(0, limit)
}

export async function fetchRecentAuctionResults({
  references,
  limit = DEFAULT_RESULT_LIMIT,
}: FetchAuctionResultsOptions): Promise<AuctionResult[]> {
  if (references.length === 0) {
    return []
  }

  const cacheKey = buildAuctionCacheKey(references, limit)
  const cached = await readAuctionCache(cacheKey)

  const loadFromNetwork = async (): Promise<AuctionResult[]> => {
    // Always attempt the Christie's and Phillips APIs directly. Any optional
    // env-var-configured custom feeds are also included.
    const fetchers: Array<() => Promise<AuctionResult[]>> = [
      () => fetchChristiesResults(references),
      () => fetchPhillipsResults(references),
      ...CUSTOM_FEED_CONFIGS.map((feed) => () => fetchFeed(feed)),
    ]

    const feedResults = await Promise.allSettled(fetchers.map((fetcher) => fetcher()))
    const allItems = feedResults.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    const normalized = normalizeAndFilter(allItems, references, limit)
    await writeAuctionCache(cacheKey, normalized)
    return normalized
  }

  if (cached.state === 'fresh' && cached.data) {
    return cached.data
  }

  if (cached.state === 'stale' && cached.data) {
    if (!auctionRefreshInflight.has(cacheKey)) {
      const refreshRequest = loadFromNetwork()
        .catch(() => cached.data ?? [])
        .finally(() => {
          auctionRefreshInflight.delete(cacheKey)
        })
      auctionRefreshInflight.set(cacheKey, refreshRequest)
    }
    return cached.data
  }

  const inflight = auctionRefreshInflight.get(cacheKey)
  if (inflight) return inflight

  const request = loadFromNetwork().finally(() => {
    auctionRefreshInflight.delete(cacheKey)
  })
  auctionRefreshInflight.set(cacheKey, request)
  return request
}
