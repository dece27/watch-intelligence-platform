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

// Include Christie's-specific price field names alongside generic ones.
const VALUE_KEYS = [
  'result',
  'hammerPrice',
  'realizedPrice',
  'price',
  'soldPrice',
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
    /(estimate|est\.?)\s*[:\-]?\s*(?:US\$|\$|USD|HK\$|CHF|GBP|£|€)?\s*([\d,.]+)\s*(?:-|–|to)\s*(?:US\$|\$|USD|HK\$|CHF|GBP|£|€)?\s*([\d,.]+)/i
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

  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed
  }

  if (trimmed.startsWith('/')) {
    const normalizedHouse = house.toLowerCase()
    if (normalizedHouse.includes('christie')) {
      return `${CHRISTIES_BASE_URL}${trimmed}`
    }
    if (normalizedHouse.includes('phillips')) {
      return `${PHILLIPS_BASE_URL}${trimmed}`
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
  const sourceUrl = resolveSourceUrl(getStringValue(item, URL_KEYS), house)

  const result = extractNumber(getFirstValue(item, VALUE_KEYS)) ?? extractNumber(notes)
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

  // Always attempt the Christie's and Phillips APIs directly. Any optional
  // env-var-configured custom feeds are also included.
  const fetchers: Array<() => Promise<AuctionResult[]>> = [
    () => fetchChristiesResults(references),
    () => fetchPhillipsResults(references),
    ...CUSTOM_FEED_CONFIGS.map((feed) => () => fetchFeed(feed)),
  ]

  const feedResults = await Promise.allSettled(fetchers.map((fetcher) => fetcher()))
  const allItems = feedResults.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))

  return normalizeAndFilter(allItems, references, limit)
}
