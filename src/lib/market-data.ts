import type { Deal, PriceAlert, Watch } from "@/lib/types"
import { convertCurrency } from "@/lib/currency"
import { watchChartsClient } from "@/lib/watchcharts-client"

export type MarketDataSource = "watchcharts" | "thewatchapi" | "ebay" | "heuristic"

export interface MarketSeriesPoint {
  month: string
  price: number
}

export interface NormalizedMarketData {
  reference: string
  brand: string
  model: string
  currency: string
  latestPrice: number
  series12m: MarketSeriesPoint[]
  moversDelta: number
  source: MarketDataSource
  updatedAt: string
  confidence: number
}

export interface BrandMarketIndex {
  brand: string
  currentIndex: number
  trend: number[]
  source: MarketDataSource
  updatedAt: string
  confidence: number
  sentimentScore?: number
}

export interface MarketMover {
  reference: string
  brand: string
  model: string
  currentPrice: number
  change: number
  direction: "up" | "down"
  source: MarketDataSource
  updatedAt: string
}

export interface MarketDashboardData {
  brandIndices: BrandMarketIndex[]
  topMovers: MarketMover[]
  updatedAt: string
}

export interface PriceAlertEvaluation {
  alertId: string
  latestPrice: number | null
  currency: string
  source: MarketDataSource
  updatedAt: string
  confidence: number
  isTriggered: boolean
}

interface MarketLookupInput {
  brand: string
  model: string
  referenceNumber?: string
  heuristicPrice?: number
}

const CACHE_KEY_PREFIX = "market_data_snapshot_v1_"
const CACHE_TTL_MS = 1000 * 60 * 30
const DAILY_BUDGET_STORAGE_KEY = "market_data_daily_budget_v1"
const FX_CACHE_TTL_MS = 1000 * 60 * 60 * 6
const SENTIMENT_CACHE_TTL_MS = 1000 * 60 * 60 * 2

type BudgetProvider = MarketDataSource | "gdelt" | "frankfurter"

const PROVIDER_DAILY_LIMITS: Record<BudgetProvider, number> = {
  watchcharts: 1200,
  thewatchapi: 900,
  ebay: 1200,
  heuristic: Number.POSITIVE_INFINITY,
  gdelt: 500,
  frankfurter: 600,
}

const DEFAULT_REFERENCE_TARGETS: MarketLookupInput[] = [
  { brand: "Rolex", model: "Submariner", referenceNumber: "126610LN" },
  { brand: "Rolex", model: "Daytona", referenceNumber: "126500LN" },
  { brand: "Rolex", model: "GMT-Master II", referenceNumber: "126710BLRO" },
  { brand: "Patek Philippe", model: "Nautilus", referenceNumber: "5711/1A" },
  { brand: "Patek Philippe", model: "Aquanaut", referenceNumber: "5167A" },
  { brand: "Audemars Piguet", model: "Royal Oak", referenceNumber: "15510ST" },
  { brand: "Omega", model: "Speedmaster Professional", referenceNumber: "310.30.42.50.01.001" },
  { brand: "IWC", model: "Pilot's Watch", referenceNumber: "IW377710" },
]

const inMemoryCache = new Map<string, { expiresAt: number; data: NormalizedMarketData }>()
const fxRateCache = new Map<string, { expiresAt: number; rates: Record<string, number> }>()
const sentimentCache = new Map<string, { expiresAt: number; score: number }>()

const nowIso = () => new Date().toISOString()

const toMonthLabel = (date: Date) => date.toLocaleDateString("en-US", { month: "short" })

const toSnapshotKey = (input: MarketLookupInput) =>
  `${input.brand.toLowerCase()}|${input.model.toLowerCase()}|${(input.referenceNumber || "").toLowerCase()}`

const buildCacheStorageKey = (input: MarketLookupInput) => `${CACHE_KEY_PREFIX}${toSnapshotKey(input)}`

const isBrowser = () => typeof window !== "undefined"

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0.2, Math.min(1, value))
}

function getNestedValue(record: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined
    return (current as Record<string, unknown>)[key]
  }, record)
}

function extractNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return null
  const normalized = value.replace(/[^0-9.-]/g, "")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function extractString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeSeries(points: Array<{ date: string; price: number }>, fallbackPrice: number): MarketSeriesPoint[] {
  const now = new Date()
  const monthBuckets = new Map<string, number>()
  for (const point of points) {
    const date = new Date(point.date)
    if (Number.isNaN(date.getTime()) || !Number.isFinite(point.price) || point.price <= 0) continue
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`
    monthBuckets.set(key, point.price)
  }

  const series: MarketSeriesPoint[] = []
  let lastKnown = fallbackPrice
  for (let index = 11; index >= 0; index -= 1) {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))
    const key = `${monthDate.getUTCFullYear()}-${monthDate.getUTCMonth()}`
    const value = monthBuckets.get(key)
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      lastKnown = value
    }
    series.push({
      month: toMonthLabel(monthDate),
      price: Math.round(lastKnown),
    })
  }

  return series
}

function buildFallbackSeries(latestPrice: number, seed: string): MarketSeriesPoint[] {
  const now = new Date()
  const volatilitySeed = Math.max(1, seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 17)
  const baseline = Math.max(1, latestPrice)

  const series: MarketSeriesPoint[] = []
  for (let index = 11; index >= 0; index -= 1) {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))
    const drift = ((11 - index) / 11) * 0.045
    const seasonal = Math.sin((index + volatilitySeed) / 2.5) * 0.012
    const value = baseline * (1 - drift - seasonal)
    series.push({
      month: toMonthLabel(monthDate),
      price: Math.max(1, Math.round(value)),
    })
  }

  series[series.length - 1] = { ...series[series.length - 1], price: Math.round(baseline) }
  return series
}

function getSeriesDeltaPercent(series12m: MarketSeriesPoint[]): number {
  if (series12m.length < 2) return 0
  const first = series12m[0]?.price
  const last = series12m[series12m.length - 1]?.price
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return 0
  return ((last - first) / first) * 100
}

function normalizeMarketSnapshot(snapshot: Omit<NormalizedMarketData, "moversDelta">): NormalizedMarketData {
  const normalizedSeries = snapshot.series12m.length > 0
    ? snapshot.series12m
    : buildFallbackSeries(snapshot.latestPrice, `${snapshot.brand}:${snapshot.model}:${snapshot.reference}`)

  return {
    ...snapshot,
    confidence: clampConfidence(snapshot.confidence),
    series12m: normalizedSeries,
    moversDelta: Number(getSeriesDeltaPercent(normalizedSeries).toFixed(1)),
  }
}

function readDailyBudgetState(): { date: string; counts: Record<BudgetProvider, number> } {
  if (!isBrowser()) {
    return {
      date: new Date().toISOString().slice(0, 10),
      counts: { watchcharts: 0, thewatchapi: 0, ebay: 0, heuristic: 0, gdelt: 0, frankfurter: 0 },
    }
  }

  try {
    const raw = window.localStorage.getItem(DAILY_BUDGET_STORAGE_KEY)
    if (!raw) {
      return {
        date: new Date().toISOString().slice(0, 10),
        counts: { watchcharts: 0, thewatchapi: 0, ebay: 0, heuristic: 0, gdelt: 0, frankfurter: 0 },
      }
    }
    const parsed = JSON.parse(raw) as { date?: string; counts?: Partial<Record<BudgetProvider, number>> }
    const date = parsed.date || new Date().toISOString().slice(0, 10)
    const counts = parsed.counts || {}
    return {
      date,
      counts: {
        watchcharts: Number(counts.watchcharts || 0),
        thewatchapi: Number(counts.thewatchapi || 0),
        ebay: Number(counts.ebay || 0),
        heuristic: Number(counts.heuristic || 0),
        gdelt: Number(counts.gdelt || 0),
        frankfurter: Number(counts.frankfurter || 0),
      },
    }
  } catch {
    return {
      date: new Date().toISOString().slice(0, 10),
      counts: { watchcharts: 0, thewatchapi: 0, ebay: 0, heuristic: 0, gdelt: 0, frankfurter: 0 },
    }
  }
}

function writeDailyBudgetState(state: { date: string; counts: Record<BudgetProvider, number> }) {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(DAILY_BUDGET_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // no-op
  }
}

function canConsumeBudget(source: BudgetProvider): boolean {
  const limit = PROVIDER_DAILY_LIMITS[source]
  if (!Number.isFinite(limit)) return true
  const today = new Date().toISOString().slice(0, 10)
  const state = readDailyBudgetState()
  if (state.date !== today) {
    const resetState = {
      date: today,
      counts: { watchcharts: 0, thewatchapi: 0, ebay: 0, heuristic: 0, gdelt: 0, frankfurter: 0 },
    }
    writeDailyBudgetState(resetState)
    return true
  }
  return (state.counts[source] || 0) < limit
}

function consumeBudget(source: BudgetProvider) {
  const limit = PROVIDER_DAILY_LIMITS[source]
  if (!Number.isFinite(limit)) return
  const today = new Date().toISOString().slice(0, 10)
  const state = readDailyBudgetState()
  if (state.date !== today) {
    state.date = today
    state.counts = { watchcharts: 0, thewatchapi: 0, ebay: 0, heuristic: 0, gdelt: 0, frankfurter: 0 }
  }
  state.counts[source] = (state.counts[source] || 0) + 1
  writeDailyBudgetState(state)
}

async function requestJsonWithBackoff(url: string, init?: RequestInit, retries = 2): Promise<unknown> {
  let attempt = 0
  let lastError: unknown
  while (attempt <= retries) {
    try {
      const response = await fetch(url, init)
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`retryable_http_${response.status}`)
        }
        throw new Error(`http_${response.status}`)
      }
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt === retries) break
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 350))
      attempt += 1
    }
  }
  throw lastError instanceof Error ? lastError : new Error("request_failed")
}

async function getFrankfurterRates(baseCurrency: string): Promise<Record<string, number> | null> {
  const normalizedBase = baseCurrency.toUpperCase()
  const cached = fxRateCache.get(normalizedBase)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rates
  }

  const endpoint = new URL("https://api.frankfurter.app/latest")
  endpoint.searchParams.set("from", normalizedBase)

  if (!canConsumeBudget("frankfurter")) return null

  try {
    consumeBudget("frankfurter")
    const payload = await requestJsonWithBackoff(endpoint.toString())
    const rates = getNestedValue(payload, ["rates"])
    if (!rates || typeof rates !== "object") return null
    const normalizedRates = Object.entries(rates as Record<string, unknown>).reduce<Record<string, number>>((acc, [code, value]) => {
      const parsed = extractNumber(value)
      if (parsed && parsed > 0) {
        acc[code.toUpperCase()] = parsed
      }
      return acc
    }, { [normalizedBase]: 1 })
    fxRateCache.set(normalizedBase, {
      expiresAt: Date.now() + FX_CACHE_TTL_MS,
      rates: normalizedRates,
    })
    return normalizedRates
  } catch {
    return null
  }
}

async function convertCurrencyLive(amount: number, sourceCurrency = "USD", targetCurrency = "USD"): Promise<number> {
  if (!Number.isFinite(amount)) return 0
  const from = sourceCurrency.toUpperCase()
  const to = targetCurrency.toUpperCase()
  if (from === to) return amount

  const frankfurterRates = await getFrankfurterRates(from)
  const frankfurterRate = frankfurterRates?.[to]
  if (frankfurterRate && Number.isFinite(frankfurterRate) && frankfurterRate > 0) {
    return amount * frankfurterRate
  }
  return convertCurrency(amount, from, to)
}

async function getPersistentCache(input: MarketLookupInput): Promise<NormalizedMarketData | null> {
  const key = buildCacheStorageKey(input)
  const inMemory = inMemoryCache.get(key)
  if (inMemory && inMemory.expiresAt > Date.now()) {
    return inMemory.data
  }

  if (!isBrowser()) return null

  try {
    const cached = await window.spark.kv.get<{ cachedAt: string; data: NormalizedMarketData }>(key)
    if (!cached) return null
    const cachedAt = Date.parse(cached.cachedAt)
    if (!Number.isFinite(cachedAt)) return null
    if (Date.now() - cachedAt > CACHE_TTL_MS) return null
    inMemoryCache.set(key, { expiresAt: cachedAt + CACHE_TTL_MS, data: cached.data })
    return cached.data
  } catch {
    return null
  }
}

async function setPersistentCache(input: MarketLookupInput, data: NormalizedMarketData) {
  const key = buildCacheStorageKey(input)
  inMemoryCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data })
  if (!isBrowser()) return
  try {
    await window.spark.kv.set(key, { cachedAt: nowIso(), data })
  } catch {
    // no-op
  }
}

async function fromWatchCharts(input: MarketLookupInput): Promise<NormalizedMarketData | null> {
  if (!canConsumeBudget("watchcharts")) return null
  try {
    consumeBudget("watchcharts")
    const value = await watchChartsClient.getMarketValue({
      brand: input.brand,
      model: input.model,
      referenceNumber: input.referenceNumber,
    })
    if (!value || !Number.isFinite(value) || value <= 0) return null
    return normalizeMarketSnapshot({
      reference: input.referenceNumber || `${input.brand} ${input.model}`,
      brand: input.brand,
      model: input.model,
      currency: "USD",
      latestPrice: value,
      series12m: buildFallbackSeries(value, `watchcharts:${input.brand}:${input.model}:${input.referenceNumber || ""}`),
      source: "watchcharts",
      updatedAt: nowIso(),
      confidence: 0.95,
    })
  } catch {
    return null
  }
}

function parseTheWatchApiSnapshot(payload: unknown, input: MarketLookupInput): NormalizedMarketData | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const data = (record.data && typeof record.data === "object" ? record.data : record) as Record<string, unknown>

  const priceCandidates: unknown[] = [
    getNestedValue(data, ["market", "price"]),
    getNestedValue(data, ["pricing", "marketValue"]),
    getNestedValue(data, ["marketValue"]),
    getNestedValue(data, ["price"]),
    getNestedValue(data, ["latestPrice"]),
  ]
  const latestPrice = priceCandidates
    .map(extractNumber)
    .find((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
  if (!latestPrice) return null

  const currency = extractString(
    getNestedValue(data, ["currency"]) || getNestedValue(data, ["market", "currency"]) || "USD"
  ) || "USD"
  const updatedAt = extractString(
    getNestedValue(data, ["updatedAt"]) || getNestedValue(data, ["lastUpdated"]) || nowIso()
  ) || nowIso()

  const historyCandidates = [
    getNestedValue(data, ["history"]),
    getNestedValue(data, ["priceHistory"]),
    getNestedValue(data, ["chart"]),
    getNestedValue(data, ["points"]),
  ]
  const historyArray = historyCandidates.find((candidate) => Array.isArray(candidate)) as Array<Record<string, unknown>> | undefined

  const historyPoints = (historyArray || [])
    .map((point) => {
      const dateValue = extractString(point.date || point.month || point.timestamp || point.time)
      const priceValue = extractNumber(point.price || point.value || point.close || point.marketValue)
      if (!dateValue || !priceValue || priceValue <= 0) return null
      return { date: dateValue, price: priceValue }
    })
    .filter((point): point is { date: string; price: number } => point !== null)

  return normalizeMarketSnapshot({
    reference: input.referenceNumber || `${input.brand} ${input.model}`,
    brand: input.brand,
    model: input.model,
    currency,
    latestPrice,
    series12m: historyPoints.length > 0
      ? normalizeSeries(historyPoints, latestPrice)
      : buildFallbackSeries(latestPrice, `thewatchapi:${input.brand}:${input.model}:${input.referenceNumber || ""}`),
    source: "thewatchapi",
    updatedAt,
    confidence: historyPoints.length > 0 ? 0.85 : 0.75,
  })
}

async function fromTheWatchApi(input: MarketLookupInput): Promise<NormalizedMarketData | null> {
  if (!canConsumeBudget("thewatchapi")) return null
  const baseUrl = (import.meta.env.VITE_THEWATCHAPI_BASE_URL || "https://api.thewatchapi.com").trim()
  const lookupPath = (import.meta.env.VITE_THEWATCHAPI_LOOKUP_PATH || "/v1/watch").trim()
  const apiKey = import.meta.env.VITE_THEWATCHAPI_API_KEY?.trim()
  if (!baseUrl) return null

  const url = new URL(lookupPath, baseUrl)
  if (input.referenceNumber) url.searchParams.set("reference", input.referenceNumber)
  url.searchParams.set("brand", input.brand)
  url.searchParams.set("model", input.model)

  const headers: Record<string, string> = { Accept: "application/json" }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  try {
    consumeBudget("thewatchapi")
    const payload = await requestJsonWithBackoff(url.toString(), { headers })
    return parseTheWatchApiSnapshot(payload, input)
  } catch {
    return null
  }
}

function parseEbaySnapshot(payload: unknown, input: MarketLookupInput): NormalizedMarketData | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const response = Array.isArray(record.findItemsAdvancedResponse)
    ? record.findItemsAdvancedResponse[0] as Record<string, unknown>
    : null
  const searchResult = response && Array.isArray(response.searchResult)
    ? response.searchResult[0] as Record<string, unknown>
    : null
  const items = searchResult && Array.isArray(searchResult.item)
    ? searchResult.item as Array<Record<string, unknown>>
    : []
  if (items.length === 0) return null

  const pricedItems = items
    .map((item) => {
      const status = Array.isArray(item.sellingStatus) ? item.sellingStatus[0] as Record<string, unknown> : null
      const currentPrice = status && Array.isArray(status.currentPrice)
        ? status.currentPrice[0] as Record<string, unknown>
        : null
      const price = extractNumber(currentPrice?.__value__ ?? currentPrice?.value)
      const currency = extractString(currentPrice?.["@currencyId"] ?? currentPrice?.currency) || "USD"
      const listedAt = extractString(
        Array.isArray(item.listingInfo)
          ? (item.listingInfo[0] as Record<string, unknown>).startTime
          : null
      ) || nowIso()
      if (!price || price <= 0) return null
      return { price, currency, listedAt }
    })
    .filter((item): item is { price: number; currency: string; listedAt: string } => item !== null)

  if (pricedItems.length === 0) return null

  const currency = pricedItems[0].currency
  const latestPrice = pricedItems.reduce((sum, item) => sum + item.price, 0) / pricedItems.length
  const history = pricedItems.map((item) => ({ date: item.listedAt, price: item.price }))

  return normalizeMarketSnapshot({
    reference: input.referenceNumber || `${input.brand} ${input.model}`,
    brand: input.brand,
    model: input.model,
    currency,
    latestPrice: Math.round(latestPrice),
    series12m: normalizeSeries(history, latestPrice),
    source: "ebay",
    updatedAt: nowIso(),
    confidence: pricedItems.length >= 5 ? 0.72 : 0.62,
  })
}

async function fromEbay(input: MarketLookupInput): Promise<NormalizedMarketData | null> {
  if (!canConsumeBudget("ebay")) return null
  const appId = import.meta.env.VITE_EBAY_APP_ID?.trim()
  if (!appId) return null

  const keywords = [input.brand, input.model, input.referenceNumber].filter(Boolean).join(" ")
  const url = new URL("https://svcs.ebay.com/services/search/FindingService/v1")
  url.searchParams.set("OPERATION-NAME", "findItemsAdvanced")
  url.searchParams.set("SERVICE-VERSION", "1.13.0")
  url.searchParams.set("SECURITY-APPNAME", appId)
  url.searchParams.set("RESPONSE-DATA-FORMAT", "JSON")
  url.searchParams.set("REST-PAYLOAD", "true")
  url.searchParams.set("keywords", keywords)
  url.searchParams.set("paginationInput.entriesPerPage", "12")
  url.searchParams.set("sortOrder", "EndTimeSoonest")

  try {
    consumeBudget("ebay")
    const payload = await requestJsonWithBackoff(url.toString(), {
      headers: { Accept: "application/json" },
    })
    return parseEbaySnapshot(payload, input)
  } catch {
    return null
  }
}

function fromHeuristic(input: MarketLookupInput): NormalizedMarketData {
  const baseline = Math.max(100, input.heuristicPrice || 0)
  return normalizeMarketSnapshot({
    reference: input.referenceNumber || `${input.brand} ${input.model}`,
    brand: input.brand,
    model: input.model,
    currency: "USD",
    latestPrice: Math.round(baseline),
    series12m: buildFallbackSeries(baseline, `heuristic:${input.brand}:${input.model}:${input.referenceNumber || ""}`),
    source: "heuristic",
    updatedAt: nowIso(),
    confidence: 0.45,
  })
}

async function getBrandSentimentScore(brand: string): Promise<number | null> {
  const cacheKey = brand.trim().toLowerCase()
  if (!cacheKey) return null
  const cached = sentimentCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.score
  }
  if (!canConsumeBudget("gdelt")) return null

  const endpoint = new URL("https://api.gdeltproject.org/api/v2/doc/doc")
  endpoint.searchParams.set("query", `"${brand}" AND watch`)
  endpoint.searchParams.set("mode", "TimelineTone")
  endpoint.searchParams.set("format", "json")
  endpoint.searchParams.set("maxrecords", "40")

  try {
    consumeBudget("gdelt")
    const payload = await requestJsonWithBackoff(endpoint.toString())
    const timelines = getNestedValue(payload, ["timelines"])
    if (!Array.isArray(timelines) || timelines.length === 0) return null
    const firstTimeline = timelines[0]
    const points = getNestedValue(firstTimeline, ["data"])
    if (!Array.isArray(points) || points.length === 0) return null
    const values = points
      .map((point) => extractNumber(getNestedValue(point, ["value"]) ?? getNestedValue(point, ["tone"])))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    if (values.length === 0) return null
    const averageTone = average(values)
    sentimentCache.set(cacheKey, {
      expiresAt: Date.now() + SENTIMENT_CACHE_TTL_MS,
      score: averageTone,
    })
    return averageTone
  } catch {
    return null
  }
}

export function marketConfidenceLabel(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.85) return "high"
  if (confidence >= 0.65) return "medium"
  return "low"
}

export async function getNormalizedMarketData(input: MarketLookupInput): Promise<NormalizedMarketData> {
  const cached = await getPersistentCache(input)
  if (cached) return cached

  const providerResults = await Promise.all([
    fromWatchCharts(input),
    fromTheWatchApi(input),
    fromEbay(input),
  ])

  const snapshot = providerResults.find((result): result is NormalizedMarketData => result !== null)
    || fromHeuristic(input)
  await setPersistentCache(input, snapshot)
  return snapshot
}

export async function getPortfolioMarketSnapshots(
  watches: Watch[],
): Promise<Record<string, NormalizedMarketData>> {
  const entries = await Promise.all(
    watches.map(async (watch) => {
      const snapshot = await getNormalizedMarketData({
        brand: watch.brand,
        model: watch.model,
        referenceNumber: watch.referenceNumber,
        heuristicPrice: watch.currentValue || watch.purchasePrice,
      })
      return [watch.id, snapshot] as const
    })
  )
  return Object.fromEntries(entries)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export async function getMarketDashboardData(watches: Watch[]): Promise<MarketDashboardData> {
  const watchTargets = watches
    .slice(0, 18)
    .map((watch) => ({
      brand: watch.brand,
      model: watch.model,
      referenceNumber: watch.referenceNumber,
      heuristicPrice: watch.currentValue || watch.purchasePrice,
    }))

  const uniqueTargets = new Map<string, MarketLookupInput>()
  for (const target of [...watchTargets, ...DEFAULT_REFERENCE_TARGETS]) {
    const key = toSnapshotKey(target)
    if (!uniqueTargets.has(key)) uniqueTargets.set(key, target)
  }

  const snapshots = await Promise.all(
    Array.from(uniqueTargets.values()).slice(0, 16).map((target) => getNormalizedMarketData(target))
  )

  const groupedByBrand = snapshots.reduce<Record<string, NormalizedMarketData[]>>((acc, snapshot) => {
    if (!acc[snapshot.brand]) acc[snapshot.brand] = []
    acc[snapshot.brand].push(snapshot)
    return acc
  }, {})

  const sentimentByBrandEntries = await Promise.all(
    Object.keys(groupedByBrand).map(async (brand) => [brand, await getBrandSentimentScore(brand)] as const)
  )
  const sentimentByBrand = Object.fromEntries(sentimentByBrandEntries) as Record<string, number | null>

  const brandIndices = Object.entries(groupedByBrand).map(([brand, brandSnapshots]) => {
    const firstSeries = brandSnapshots[0]?.series12m || []
    const trend = firstSeries.map((_, monthIndex) => {
      const prices = brandSnapshots
        .map((snapshot) => snapshot.series12m[monthIndex]?.price)
        .filter((value): value is number => Number.isFinite(value))
      return Math.round(average(prices))
    })

    const baseline = trend[0] && trend[0] > 0 ? trend[0] : 1
    const normalizedTrend = trend.map((value) => Number(((value / baseline) * 100).toFixed(1)))
    const currentIndex = normalizedTrend[normalizedTrend.length - 1] || 100
    const confidence = average(brandSnapshots.map((snapshot) => snapshot.confidence))

    return {
      brand,
      currentIndex: Number(currentIndex.toFixed(1)),
      trend: normalizedTrend,
      source: brandSnapshots[0]?.source || "heuristic",
      updatedAt: brandSnapshots.reduce((latest, snapshot) => {
        return Date.parse(snapshot.updatedAt) > Date.parse(latest) ? snapshot.updatedAt : latest
      }, brandSnapshots[0]?.updatedAt || nowIso()),
      confidence,
      sentimentScore: sentimentByBrand[brand] ?? undefined,
    } satisfies BrandMarketIndex
  })
    .sort((left, right) => right.currentIndex - left.currentIndex)

  const topMovers = snapshots
    .map((snapshot) => ({
      reference: snapshot.reference,
      brand: snapshot.brand,
      model: snapshot.model,
      currentPrice: snapshot.latestPrice,
      change: Number(snapshot.moversDelta.toFixed(1)),
      direction: snapshot.moversDelta >= 0 ? "up" : "down",
      source: snapshot.source,
      updatedAt: snapshot.updatedAt,
    } satisfies MarketMover))
    .sort((left, right) => Math.abs(right.change) - Math.abs(left.change))
    .slice(0, 8)

  const updatedAt = snapshots.reduce((latest, snapshot) => {
    if (!latest) return snapshot.updatedAt
    return Date.parse(snapshot.updatedAt) > Date.parse(latest) ? snapshot.updatedAt : latest
  }, "")

  return {
    brandIndices,
    topMovers,
    updatedAt: updatedAt || nowIso(),
  }
}

export async function getReferenceMarketData(input: {
  reference: string
  brand?: string
  model?: string
}): Promise<NormalizedMarketData> {
  return getNormalizedMarketData({
    brand: input.brand || "Unknown",
    model: input.model || input.reference,
    referenceNumber: input.reference,
  })
}

export async function evaluatePriceAlerts(
  alerts: PriceAlert[],
  preferredCurrency = "USD",
): Promise<Record<string, PriceAlertEvaluation>> {
  const results = await Promise.all(
    alerts.map(async (alert) => {
      const snapshot = await getNormalizedMarketData({
        brand: alert.brand,
        model: alert.model,
        referenceNumber: alert.watchRef,
      })

      const latestInPreferred = await convertCurrencyLive(snapshot.latestPrice, snapshot.currency, preferredCurrency)
      const isTriggered = alert.condition === "above"
        ? latestInPreferred >= alert.targetPrice
        : latestInPreferred <= alert.targetPrice

      return [alert.id, {
        alertId: alert.id,
        latestPrice: Number(latestInPreferred.toFixed(2)),
        currency: preferredCurrency,
        source: snapshot.source,
        updatedAt: snapshot.updatedAt,
        confidence: snapshot.confidence,
        isTriggered,
      } satisfies PriceAlertEvaluation] as const
    })
  )
  return Object.fromEntries(results)
}

export async function enrichDealsWithMarketData(deals: Deal[]): Promise<Deal[]> {
  const entries = await Promise.all(
    deals.map(async (deal) => {
      const snapshot = await getNormalizedMarketData({
        brand: deal.brand,
        model: deal.model,
        referenceNumber: deal.referenceNumber,
        heuristicPrice: deal.marketValue || deal.fairValue || deal.price,
      })
      const fairValueInDealCurrency = await convertCurrencyLive(snapshot.latestPrice, snapshot.currency, deal.currency || "USD")
      const fairValue = Number(fairValueInDealCurrency.toFixed(2))
      const discount = fairValue > 0
        ? Math.max(0, Math.round(((fairValue - deal.price) / fairValue) * 100))
        : deal.discount

      return {
        ...deal,
        fairValue,
        marketValue: fairValue,
        discount,
        marketSource: snapshot.source,
        marketUpdatedAt: snapshot.updatedAt,
        marketConfidence: snapshot.confidence,
      }
    })
  )
  return entries
}
