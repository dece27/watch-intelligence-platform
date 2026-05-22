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

const FEED_CONFIGS: FeedConfig[] = [
  { house: 'Phillips', url: import.meta.env.VITE_PHILLIPS_AUCTION_FEED_URL?.trim() || '' },
  { house: 'Christie\'s', url: import.meta.env.VITE_CHRISTIES_AUCTION_FEED_URL?.trim() || '' },
].filter((config) => config.url.length > 0)

type UnknownRecord = Record<string, unknown>

const VALUE_KEYS = ['result', 'hammerPrice', 'realizedPrice', 'price', 'soldPrice', 'amount']
const EST_LOW_KEYS = ['estLow', 'estimateLow', 'lowEstimate', 'estimate_low']
const EST_HIGH_KEYS = ['estHigh', 'estimateHigh', 'highEstimate', 'estimate_high']
const DATE_KEYS = ['date', 'saleDate', 'auctionDate', 'publishedAt', 'pubDate', 'updatedAt']
const LOT_KEYS = ['lot', 'title', 'name', 'lotTitle', 'reference']
const NOTES_KEYS = ['notes', 'description', 'summary']
const URL_KEYS = ['url', 'link', 'sourceUrl']
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

function normalizeJsonItem(item: UnknownRecord, house: string): AuctionResult | null {
  const lot = getStringValue(item, LOT_KEYS)
  if (!lot) {
    return null
  }

  const notes = getStringValue(item, NOTES_KEYS)
  const dateString = getStringValue(item, DATE_KEYS)
  const reference = getStringValue(item, REFERENCE_KEYS)
  const sourceUrl = getStringValue(item, URL_KEYS)

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

async function fetchFeed(feed: FeedConfig): Promise<AuctionResult[]> {
  const response = await fetch(feed.url)
  if (!response.ok) {
    throw new Error(`${feed.house} feed request failed with status ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''
  const extractItemsArray = (payload: unknown): unknown[] => {
    if (Array.isArray(payload)) {
      return payload
    }

    if (!payload || typeof payload !== 'object') {
      return []
    }

    const record = payload as UnknownRecord
    if (Array.isArray(record.items)) {
      return record.items as unknown[]
    }

    if (Array.isArray(record.results)) {
      return record.results as unknown[]
    }

    return []
  }

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

function normalizeAndFilter(
  items: AuctionResult[],
  references: string[],
  limit: number
): AuctionResult[] {
  const lowerCaseRefs = references.map((reference) => reference.toLowerCase())

  return items
    .filter((item) => {
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
  if (FEED_CONFIGS.length === 0 || references.length === 0) {
    return []
  }

  const feedResults = await Promise.allSettled(FEED_CONFIGS.map((feed) => fetchFeed(feed)))
  const allItems = feedResults.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))

  return normalizeAndFilter(allItems, references, limit)
}
