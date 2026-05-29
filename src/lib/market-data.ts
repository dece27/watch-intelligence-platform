import type { Deal, PriceAlert, Watch } from "@/lib/types"
import { convertCurrency } from "@/lib/currency"
import { watchChartsClient } from "@/lib/watchcharts-client"
import { installSparkKVFallback } from "@/lib/sparkKV"

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

interface MarketLookupCandidate {
  brand?: unknown
  model?: unknown
  referenceNumber?: unknown
  heuristicPrice?: unknown
}

const CACHE_KEY_PREFIX = "market_data_snapshot_v1_"
const CACHE_TTL_MS = 1000 * 60 * 30
const SNAPSHOT_CACHE_STALE_TTL_MS = 1000 * 60 * 60 * 24
const DASHBOARD_CACHE_KEY_PREFIX = "market_dashboard_v1_"
const DASHBOARD_CACHE_TTL_MS = 1000 * 60 * 60
const DASHBOARD_CACHE_STALE_TTL_MS = 1000 * 60 * 60 * 24 * 2
const SENTIMENT_CACHE_KEY_PREFIX = "market_sentiment_v1_"
const DAILY_BUDGET_STORAGE_KEY = "market_data_daily_budget_v1"
const PROVIDER_COOLDOWN_STORAGE_KEY = "market_data_provider_cooldown_v1"
const FX_CACHE_TTL_MS = 1000 * 60 * 60 * 6
const SENTIMENT_CACHE_TTL_MS = 1000 * 60 * 60 * 6
const SENTIMENT_CACHE_STALE_TTL_MS = 1000 * 60 * 60 * 72
const NEGATIVE_CACHE_TTL_MS = 1000 * 60 * 15
const MAX_GDELT_BRANDS_PER_LOAD = 4
const IMMEDIATE_GDELT_BRANDS_PER_LOAD = 2
const DASHBOARD_TARGET_LIMIT = 10
const DEFERRED_DEFAULT_TARGET_LIMIT = 6
const SNAPSHOT_CONCURRENCY_LIMIT = 4
const SENTIMENT_REQUEST_SPACING_MS = import.meta.env.MODE === "test" ? 0 : 400
const MIN_RETRY_DELAY_MS = 250
const DEFAULT_PROVIDER_COOLDOWN_MS = 1000 * 60
const DEFAULT_LOOKUP_BRAND = "Unknown"
const DEFAULT_LOOKUP_MODEL = "Unknown Model"

type BudgetProvider = MarketDataSource | "gdelt" | "frankfurter"

const PROVIDER_DAILY_LIMITS: Record<BudgetProvider, number> = {
  watchcharts: 1200,
  thewatchapi: 900,
  ebay: 1200,
  heuristic: Number.POSITIVE_INFINITY,
  gdelt: 30,
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
const dashboardMemoryCache = new Map<string, { expiresAt: number; data: MarketDashboardData }>()
const fxRateCache = new Map<string, { expiresAt: number; rates: Record<string, number> }>()
const sentimentCache = new Map<string, { expiresAt: number; cachedAt: number; score: number | null }>()
const snapshotInflightRequests = new Map<string, Promise<NormalizedMarketData>>()
const dashboardInflightRequests = new Map<string, Promise<MarketDashboardData>>()
const sentimentInflightRequests = new Map<string, Promise<number | null>>()
const providerCooldowns = new Map<BudgetProvider, number>()

// In-memory cache for the daily budget state to avoid repeated localStorage reads/parses.
let dailyBudgetStateCache: { date: string; counts: Record<BudgetProvider, number> } | null = null

const nowIso = () => new Date().toISOString()
const createEmptyDashboard = (): MarketDashboardData => ({ brandIndices: [], topMovers: [], updatedAt: nowIso() })

const toMonthLabel = (date: Date) => date.toLocaleDateString("en-US", { month: "short" })

function normalizeLookupInput(input: MarketLookupInput): MarketLookupInput {
  const normalizedReference = extractString(input.referenceNumber) || undefined
  const normalizedBrand = extractString(input.brand) || DEFAULT_LOOKUP_BRAND
  const normalizedModel = extractString(input.model) || normalizedReference || DEFAULT_LOOKUP_MODEL
  const heuristicPrice = Number.isFinite(input.heuristicPrice) && Number(input.heuristicPrice) > 0
    ? Number(input.heuristicPrice)
    : undefined

  return {
    brand: normalizedBrand,
    model: normalizedModel,
    referenceNumber: normalizedReference,
    heuristicPrice,
  }
}

const toSnapshotKey = (input: MarketLookupInput) => {
  const normalized = normalizeLookupInput(input)
  return `${normalized.brand.toLowerCase()}|${normalized.model.toLowerCase()}|${(normalized.referenceNumber || "").toLowerCase()}`
}

const buildCacheStorageKey = (input: MarketLookupInput) => `${CACHE_KEY_PREFIX}${toSnapshotKey(input)}`
const buildSentimentCacheStorageKey = (brand: string) => `${SENTIMENT_CACHE_KEY_PREFIX}${brand.trim().toLowerCase()}`

function computeFNV1aHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return (hash >>> 0).toString(36)
}

function buildDashboardWatchSignature(watches: Watch[]): string {
  const normalized = watches
    .slice(0, 50)
    .map((watch) => [
      watch.id || "",
      extractString(watch.brand)?.toLowerCase() || "",
      extractString(watch.model)?.toLowerCase() || "",
      extractString(watch.referenceNumber)?.toLowerCase() || "",
      Number.isFinite(watch.currentValue) ? String(watch.currentValue) : "",
    ].join("|"))
    .sort()
  return computeFNV1aHash(normalized.join("::"))
}

const buildDashboardCacheStorageKey = (signature: string) => `${DASHBOARD_CACHE_KEY_PREFIX}${signature}`

const isBrowser = () => typeof window !== "undefined"

function logMarketEvent(event: string, metadata?: Record<string, unknown>) {
  if (import.meta.env.MODE !== "development" && import.meta.env.MODE !== "test") return
  if (metadata) {
    console.debug(`[market-data] ${event}`, metadata)
    return
  }
  console.debug(`[market-data] ${event}`)
}

function readProviderCooldownsFromStorage(): Partial<Record<BudgetProvider, number>> {
  if (!isBrowser()) return {}
  try {
    const raw = window.localStorage.getItem(PROVIDER_COOLDOWN_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<Record<BudgetProvider, number>>
    return parsed || {}
  } catch {
    return {}
  }
}

function writeProviderCooldownsToStorage() {
  if (!isBrowser()) return
  try {
    const serializable = Object.fromEntries(providerCooldowns.entries()) as Partial<Record<BudgetProvider, number>>
    window.localStorage.setItem(PROVIDER_COOLDOWN_STORAGE_KEY, JSON.stringify(serializable))
  } catch {
    // no-op
  }
}

function ensureProviderCooldownsLoaded() {
  if (providerCooldowns.size > 0) return
  const persisted = readProviderCooldownsFromStorage()
  for (const provider of Object.keys(PROVIDER_DAILY_LIMITS) as BudgetProvider[]) {
    const value = Number(persisted[provider] || 0)
    if (value > Date.now()) providerCooldowns.set(provider, value)
  }
}

function getProviderCooldownRemainingMs(source: BudgetProvider): number {
  ensureProviderCooldownsLoaded()
  const until = providerCooldowns.get(source)
  if (!until) return 0
  const remaining = until - Date.now()
  if (remaining <= 0) {
    providerCooldowns.delete(source)
    writeProviderCooldownsToStorage()
    return 0
  }
  return remaining
}

function setProviderCooldown(source: BudgetProvider, cooldownMs: number) {
  const normalizedCooldown = Number.isFinite(cooldownMs) && cooldownMs > 0
    ? Math.max(MIN_RETRY_DELAY_MS, Math.round(cooldownMs))
    : DEFAULT_PROVIDER_COOLDOWN_MS
  providerCooldowns.set(source, Date.now() + normalizedCooldown)
  writeProviderCooldownsToStorage()
  logMarketEvent("provider.cooldown.set", { source, cooldownMs: normalizedCooldown })
}

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

/**
 * Safely parses a finite numeric value from unknown input.
 * Returns undefined for non-numeric, NaN, and infinite values.
 */
function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return undefined
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Normalizes a lookup candidate into a safe market lookup input.
 * Requires non-empty brand and model strings; reference and heuristic are optional.
 * Returns null when required fields are missing or invalid.
 */
function sanitizeLookupInput(input: MarketLookupCandidate): MarketLookupInput | null {
  const brand = extractString(input.brand)
  const model = extractString(input.model)
  if (!brand || !model) return null

  const referenceNumber = extractString(input.referenceNumber) || undefined
  const heuristicPrice = toNumberOrUndefined(input.heuristicPrice)

  return {
    brand,
    model,
    referenceNumber,
    heuristicPrice,
  }
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
  const today = new Date().toISOString().slice(0, 10)

  // Return in-memory cache when the date matches, avoiding localStorage reads.
  if (dailyBudgetStateCache && dailyBudgetStateCache.date === today) {
    return dailyBudgetStateCache
  }

  const emptyState = {
    date: today,
    counts: { watchcharts: 0, thewatchapi: 0, ebay: 0, heuristic: 0, gdelt: 0, frankfurter: 0 },
  }

  if (!isBrowser()) {
    dailyBudgetStateCache = emptyState
    return emptyState
  }

  try {
    const raw = window.localStorage.getItem(DAILY_BUDGET_STORAGE_KEY)
    if (!raw) {
      dailyBudgetStateCache = emptyState
      return emptyState
    }
    const parsed = JSON.parse(raw) as { date?: string; counts?: Partial<Record<BudgetProvider, number>> }
    const date = parsed.date || today
    const counts = parsed.counts || {}
    const state = {
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
    // Cache the parsed state; if the stored date is stale, seed cache with emptyState so
    // subsequent reads don't re-parse localStorage until the next write resets the day.
    dailyBudgetStateCache = date === today ? state : emptyState
    return state
  } catch {
    dailyBudgetStateCache = emptyState
    return emptyState
  }
}

function writeDailyBudgetState(state: { date: string; counts: Record<BudgetProvider, number> }) {
  dailyBudgetStateCache = state
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(DAILY_BUDGET_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // no-op
  }
}

function canConsumeBudget(source: BudgetProvider): boolean {
  const cooldownRemainingMs = getProviderCooldownRemainingMs(source)
  if (cooldownRemainingMs > 0) {
    logMarketEvent("provider.cooldown.active", { source, cooldownRemainingMs })
    return false
  }
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
  const canConsume = (state.counts[source] || 0) < limit
  if (!canConsume) {
    logMarketEvent("provider.daily_limit.reached", { source, limit })
  }
  return canConsume
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

class RateLimitError extends Error {
  retryAfterMs: number | null

  constructor(message: string, retryAfterMs: number | null = null) {
    super(message)
    this.name = "RateLimitError"
    this.retryAfterMs = retryAfterMs
  }
}

function parseRetryAfterMs(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) return null
  const asSeconds = Number(retryAfterHeader)
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.max(MIN_RETRY_DELAY_MS, Math.round(asSeconds * 1000))
  }

  const asDateMs = Date.parse(retryAfterHeader)
  if (Number.isNaN(asDateMs)) return null
  const delta = asDateMs - Date.now()
  return delta > 0 ? Math.max(MIN_RETRY_DELAY_MS, delta) : null
}

function sleep(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestJsonWithBackoff(
  url: string,
  init?: RequestInit,
  retries = 2,
  timeoutMs = 10000,
  provider?: BudgetProvider,
): Promise<unknown> {
  let attempt = 0
  let lastError: unknown
  while (attempt <= retries) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { signal: controller.signal, ...init })
      clearTimeout(timeoutId)
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"))
          if (provider) {
            setProviderCooldown(provider, retryAfterMs ?? DEFAULT_PROVIDER_COOLDOWN_MS)
          }
          logMarketEvent("provider.rate_limited", { provider, retryAfterMs, url })
          throw new RateLimitError("retryable_http_429", retryAfterMs)
        }
        if (response.status >= 500) {
          throw new Error(`retryable_http_${response.status}`)
        }
        throw new Error(`http_${response.status}`)
      }
      return await response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      lastError = error
      if (error instanceof RateLimitError) {
        break
      }
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
    const payload = await requestJsonWithBackoff(endpoint.toString(), undefined, 2, 10000, "frankfurter")
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

type CacheState = "fresh" | "stale" | "expired"

interface SnapshotCacheRecord {
  cachedAt: string
  data: NormalizedMarketData
}

interface DashboardCacheRecord {
  cachedAt: string
  data: MarketDashboardData
}

interface SentimentCacheRecord {
  cachedAt: string
  score: number | null
}

interface ResolvedCache<T> {
  state: CacheState
  value: T | null
}

function resolveCacheState(cachedAt: number, freshTtlMs: number, staleTtlMs: number): CacheState {
  const ageMs = Date.now() - cachedAt
  if (ageMs <= freshTtlMs) return "fresh"
  if (ageMs <= staleTtlMs) return "stale"
  return "expired"
}

function getSentimentCacheTtlMs(score: number | null, explicitTtlMs?: number): number {
  if (explicitTtlMs && Number.isFinite(explicitTtlMs) && explicitTtlMs > 0) {
    return explicitTtlMs
  }
  return score === null ? NEGATIVE_CACHE_TTL_MS : SENTIMENT_CACHE_TTL_MS
}

/**
 * Reads the market snapshot cache from memory and persistent storage.
 * Returns:
 * - fresh: use immediately, no refresh needed.
 * - stale: safe to use immediately; caller should trigger async refresh.
 * - expired: no usable cache available.
 */
async function getSnapshotCacheState(input: MarketLookupInput): Promise<ResolvedCache<NormalizedMarketData>> {
  const key = buildCacheStorageKey(input)
  const inMemory = inMemoryCache.get(key)
  if (inMemory) {
    const state = inMemory.expiresAt > Date.now() ? "fresh" : "stale"
    logMarketEvent(`snapshot.cache.${state}`, { layer: "memory", key })
    return { state, value: inMemory.data }
  }

  if (!isBrowser()) {
    logMarketEvent("snapshot.cache.miss", { layer: "none", key })
    return { state: "expired", value: null }
  }

  installSparkKVFallback()
  try {
    const cached = await window.spark.kv.get<SnapshotCacheRecord>(key)
    if (!cached || !cached.data) {
      logMarketEvent("snapshot.cache.miss", { layer: "persistent", key })
      return { state: "expired", value: null }
    }
    const cachedAt = Date.parse(cached.cachedAt)
    if (!Number.isFinite(cachedAt)) {
      logMarketEvent("snapshot.cache.miss", { layer: "persistent", key, reason: "invalid_cachedAt" })
      return { state: "expired", value: null }
    }
    const state = resolveCacheState(cachedAt, CACHE_TTL_MS, SNAPSHOT_CACHE_STALE_TTL_MS)
    if (state === "expired") {
      logMarketEvent("snapshot.cache.miss", { layer: "persistent", key, reason: "expired" })
      return { state, value: null }
    }
    inMemoryCache.set(key, {
      expiresAt: cachedAt + CACHE_TTL_MS,
      data: cached.data,
    })
    logMarketEvent(`snapshot.cache.${state}`, { layer: "persistent", key })
    return { state, value: cached.data }
  } catch {
    logMarketEvent("snapshot.cache.miss", { layer: "persistent", key, reason: "read_error" })
    return { state: "expired", value: null }
  }
}

async function setPersistentCache(input: MarketLookupInput, data: NormalizedMarketData) {
  const key = buildCacheStorageKey(input)
  inMemoryCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data })
  if (!isBrowser()) return
  installSparkKVFallback()
  try {
    await window.spark.kv.set<SnapshotCacheRecord>(key, { cachedAt: nowIso(), data })
  } catch {
    // no-op
  }
}

async function getDashboardCacheState(cacheKey: string): Promise<ResolvedCache<MarketDashboardData>> {
  const inMemory = dashboardMemoryCache.get(cacheKey)
  if (inMemory) {
    const state = inMemory.expiresAt > Date.now() ? "fresh" : "stale"
    logMarketEvent(`dashboard.cache.${state}`, { layer: "memory", key: cacheKey })
    return { state, value: inMemory.data }
  }

  if (!isBrowser()) {
    logMarketEvent("dashboard.cache.miss", { layer: "none", key: cacheKey })
    return { state: "expired", value: null }
  }

  installSparkKVFallback()
  try {
    const cached = await window.spark.kv.get<DashboardCacheRecord>(cacheKey)
    if (!cached || !cached.data) {
      logMarketEvent("dashboard.cache.miss", { layer: "persistent", key: cacheKey })
      return { state: "expired", value: null }
    }
    const cachedAt = Date.parse(cached.cachedAt)
    if (!Number.isFinite(cachedAt)) {
      logMarketEvent("dashboard.cache.miss", { layer: "persistent", key: cacheKey, reason: "invalid_cachedAt" })
      return { state: "expired", value: null }
    }
    const state = resolveCacheState(cachedAt, DASHBOARD_CACHE_TTL_MS, DASHBOARD_CACHE_STALE_TTL_MS)
    if (state === "expired") {
      logMarketEvent("dashboard.cache.miss", { layer: "persistent", key: cacheKey, reason: "expired" })
      return { state, value: null }
    }
    dashboardMemoryCache.set(cacheKey, {
      expiresAt: cachedAt + DASHBOARD_CACHE_TTL_MS,
      data: cached.data,
    })
    logMarketEvent(`dashboard.cache.${state}`, { layer: "persistent", key: cacheKey })
    return { state, value: cached.data }
  } catch {
    logMarketEvent("dashboard.cache.miss", { layer: "persistent", key: cacheKey, reason: "read_error" })
    return { state: "expired", value: null }
  }
}

async function setPersistentDashboardCache(cacheKey: string, data: MarketDashboardData) {
  dashboardMemoryCache.set(cacheKey, { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, data })
  if (!isBrowser()) return
  installSparkKVFallback()
  try {
    await window.spark.kv.set<DashboardCacheRecord>(cacheKey, { cachedAt: nowIso(), data })
  } catch {
    // no-op
  }
}

async function getSentimentCacheState(brand: string): Promise<ResolvedCache<number | null>> {
  const normalizedBrand = brand.trim().toLowerCase()
  if (!normalizedBrand) return { state: "expired", value: null }
  const key = buildSentimentCacheStorageKey(brand)
  const inMemory = sentimentCache.get(normalizedBrand)
  if (inMemory) {
    const state = inMemory.expiresAt > Date.now() ? "fresh" : "stale"
    logMarketEvent(`sentiment.cache.${state}`, { layer: "memory", key })
    return { state, value: inMemory.score }
  }

  if (!isBrowser()) {
    logMarketEvent("sentiment.cache.miss", { layer: "none", brand: normalizedBrand })
    return { state: "expired", value: null }
  }

  installSparkKVFallback()
  try {
    const cached = await window.spark.kv.get<SentimentCacheRecord>(key)
    if (!cached) {
      logMarketEvent("sentiment.cache.miss", { layer: "persistent", brand: normalizedBrand })
      return { state: "expired", value: null }
    }
    const cachedAt = Date.parse(cached.cachedAt)
    if (!Number.isFinite(cachedAt)) {
      logMarketEvent("sentiment.cache.miss", { layer: "persistent", brand: normalizedBrand, reason: "invalid_cachedAt" })
      return { state: "expired", value: null }
    }
    const state = resolveCacheState(cachedAt, SENTIMENT_CACHE_TTL_MS, SENTIMENT_CACHE_STALE_TTL_MS)
    if (state === "expired") {
      logMarketEvent("sentiment.cache.miss", { layer: "persistent", brand: normalizedBrand, reason: "expired" })
      return { state, value: null }
    }
    sentimentCache.set(normalizedBrand, {
      expiresAt: cachedAt + getSentimentCacheTtlMs(cached.score ?? null),
      cachedAt,
      score: cached.score,
    })
    logMarketEvent(`sentiment.cache.${state}`, { layer: "persistent", key })
    return { state, value: cached.score ?? null }
  } catch {
    logMarketEvent("sentiment.cache.miss", { layer: "persistent", brand: normalizedBrand, reason: "read_error" })
    return { state: "expired", value: null }
  }
}

async function setPersistentSentimentCache(
  brand: string,
  score: number | null,
  options?: { ttlMs?: number },
): Promise<void> {
  const cacheKey = brand.trim().toLowerCase()
  if (!cacheKey) return
  const ttlMs = getSentimentCacheTtlMs(score, options?.ttlMs)
  sentimentCache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    cachedAt: Date.now(),
    score,
  })
  if (!isBrowser()) return
  installSparkKVFallback()
  try {
    await window.spark.kv.set<SentimentCacheRecord>(buildSentimentCacheStorageKey(brand), {
      cachedAt: nowIso(),
      score,
    })
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
    const payload = await requestJsonWithBackoff(url.toString(), { headers }, 1, 7000, "thewatchapi")
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
    }, 1, 7000, "ebay")
    return parseEbaySnapshot(payload, input)
  } catch {
    return null
  }
}

function fromHeuristic(input: MarketLookupInput): NormalizedMarketData {
  const price = input.heuristicPrice || 0
  const seriesBaseline = Math.max(100, price)
  return normalizeMarketSnapshot({
    reference: input.referenceNumber || `${input.brand} ${input.model}`,
    brand: input.brand,
    model: input.model,
    currency: "USD",
    latestPrice: Math.round(price),
    series12m: buildFallbackSeries(seriesBaseline, `heuristic:${input.brand}:${input.model}:${input.referenceNumber || ""}`),
    source: "heuristic",
    updatedAt: nowIso(),
    confidence: price > 0 ? 0.45 : 0,
  })
}

async function getBrandSentimentScore(brand: string): Promise<number | null> {
  const cacheKey = brand.trim().toLowerCase()
  if (!cacheKey) return null
  const cacheState = await getSentimentCacheState(brand)
  if (cacheState.state === "fresh") return cacheState.value
  if (!canConsumeBudget("gdelt")) {
    return cacheState.value
  }

  const inflight = sentimentInflightRequests.get(cacheKey)
  if (inflight) {
    logMarketEvent("sentiment.request.coalesced", { brand: cacheKey })
    return inflight
  }

  const endpoint = new URL("https://api.gdeltproject.org/api/v2/doc/doc")
  endpoint.searchParams.set("query", `"${brand}" AND watch`)
  endpoint.searchParams.set("mode", "TimelineTone")
  endpoint.searchParams.set("format", "json")
  endpoint.searchParams.set("maxrecords", "40")

  const request = (async () => {
    try {
      consumeBudget("gdelt")
      const payload = await requestJsonWithBackoff(endpoint.toString(), undefined, 2, 10000, "gdelt")
      const timelines = getNestedValue(payload, ["timelines"])
      if (!Array.isArray(timelines) || timelines.length === 0) {
        await setPersistentSentimentCache(brand, null)
        return null
      }
      const firstTimeline = timelines[0]
      const points = getNestedValue(firstTimeline, ["data"])
      if (!Array.isArray(points) || points.length === 0) {
        await setPersistentSentimentCache(brand, null)
        return null
      }
      const values = points
        .map((point) => extractNumber(getNestedValue(point, ["value"]) ?? getNestedValue(point, ["tone"])))
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      if (values.length === 0) {
        await setPersistentSentimentCache(brand, null)
        return null
      }
      const averageTone = average(values)
      await setPersistentSentimentCache(brand, averageTone)
      return averageTone
    } catch (error) {
      if (error instanceof RateLimitError) {
        await setPersistentSentimentCache(brand, null)
      }
      // Fall back to any previously cached value so dashboard rendering remains resilient during transient failures.
      return cacheState.value
    } finally {
      sentimentInflightRequests.delete(cacheKey)
    }
  })()
  sentimentInflightRequests.set(cacheKey, request)
  return request
}

export function marketConfidenceLabel(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.85) return "high"
  if (confidence >= 0.65) return "medium"
  return "low"
}

async function fetchAndCacheSnapshot(normalizedInput: MarketLookupInput): Promise<NormalizedMarketData> {
  const providerOrder: Array<{ source: MarketDataSource; fetcher: (input: MarketLookupInput) => Promise<NormalizedMarketData | null> }> = [
    { source: "watchcharts", fetcher: fromWatchCharts },
    { source: "thewatchapi", fetcher: fromTheWatchApi },
    { source: "ebay", fetcher: fromEbay },
  ]

  let snapshot: NormalizedMarketData | null = null
  for (const provider of providerOrder) {
    const startedAt = Date.now()
    const providerResult = await provider.fetcher(normalizedInput)
    logMarketEvent("snapshot.provider.complete", {
      provider: provider.source,
      durationMs: Date.now() - startedAt,
      hit: Boolean(providerResult),
      reference: normalizedInput.referenceNumber || `${normalizedInput.brand}:${normalizedInput.model}`,
    })
    if (providerResult) {
      snapshot = providerResult
      if (providerResult.confidence >= 0.8) break
    }
  }

  const resolvedSnapshot = snapshot || fromHeuristic(normalizedInput)
  await setPersistentCache(normalizedInput, resolvedSnapshot)
  return resolvedSnapshot
}

function queueSnapshotRefresh(normalizedInput: MarketLookupInput) {
  const cacheKey = buildCacheStorageKey(normalizedInput)
  if (snapshotInflightRequests.has(cacheKey)) return
  const refreshRequest = fetchAndCacheSnapshot(normalizedInput)
    .catch(() => fromHeuristic(normalizedInput))
    .finally(() => {
      snapshotInflightRequests.delete(cacheKey)
    })
  snapshotInflightRequests.set(cacheKey, refreshRequest)
  logMarketEvent("snapshot.cache.refresh_queued", { key: cacheKey })
}

export async function getNormalizedMarketData(input: MarketLookupInput): Promise<NormalizedMarketData> {
  const normalizedInput = normalizeLookupInput(input)
  const cacheKey = buildCacheStorageKey(normalizedInput)
  const cached = await getSnapshotCacheState(normalizedInput)
  if (cached.state === "fresh" && cached.value) return cached.value

  const inflight = snapshotInflightRequests.get(cacheKey)
  if (inflight) {
    logMarketEvent("snapshot.request.coalesced", { key: cacheKey })
    if (cached.value) return cached.value
    return inflight
  }

  if (cached.state === "stale" && cached.value) {
    queueSnapshotRefresh(normalizedInput)
    return cached.value
  }

  const request = fetchAndCacheSnapshot(normalizedInput)
    .finally(() => {
      snapshotInflightRequests.delete(cacheKey)
    })
  snapshotInflightRequests.set(cacheKey, request)
  return request
}

export async function getPortfolioMarketSnapshots(
  watches: Watch[],
): Promise<Record<string, NormalizedMarketData>> {
  const entries = await mapWithConcurrencyLimit(watches, SNAPSHOT_CONCURRENCY_LIMIT, async (watch) => {
    const snapshot = await getNormalizedMarketData({
      brand: watch.brand,
      model: watch.model,
      referenceNumber: watch.referenceNumber,
      heuristicPrice: watch.currentValue,
    })
    return [watch.id, snapshot] as const
  })
  return Object.fromEntries(entries)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function __resetMarketDataStateForTests() {
  inMemoryCache.clear()
  dashboardMemoryCache.clear()
  fxRateCache.clear()
  sentimentCache.clear()
  snapshotInflightRequests.clear()
  dashboardInflightRequests.clear()
  sentimentInflightRequests.clear()
  providerCooldowns.clear()
  dailyBudgetStateCache = null
}

async function mapWithConcurrencyLimit<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) return []
  const maxConcurrency = Math.max(1, Math.floor(concurrency))
  const results = new Array<TOutput>(items.length)
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(maxConcurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  })

  await Promise.all(workers)
  return results
}

async function computeMarketDashboardData(watches: Watch[]): Promise<MarketDashboardData> {
  const dashboardLoadStartedAt = Date.now()
  const watchTargets: MarketLookupInput[] = watches
    .slice(0, 18)
    .map((watch) => sanitizeLookupInput({
      brand: watch.brand,
      model: watch.model,
      referenceNumber: watch.referenceNumber,
      heuristicPrice: watch.currentValue,
    }))
    .filter((target): target is MarketLookupInput => target !== null)

  const uniqueWatchTargets = new Map<string, MarketLookupInput>()
  for (const target of watchTargets) {
    const key = toSnapshotKey(target)
    if (!uniqueWatchTargets.has(key)) uniqueWatchTargets.set(key, target)
  }
  const uniqueDefaultTargets = new Map<string, MarketLookupInput>()
  for (const target of DEFAULT_REFERENCE_TARGETS
    .map((item) => sanitizeLookupInput(item))
    .filter((item): item is MarketLookupInput => item !== null)) {
    const key = toSnapshotKey(target)
    if (!uniqueWatchTargets.has(key) && !uniqueDefaultTargets.has(key)) uniqueDefaultTargets.set(key, target)
  }

  const immediateDefaultTargetCount = Math.max(0, DASHBOARD_TARGET_LIMIT - uniqueWatchTargets.size)
  const immediateTargets = [
    ...Array.from(uniqueWatchTargets.values()),
    ...Array.from(uniqueDefaultTargets.values()).slice(0, immediateDefaultTargetCount),
  ].slice(0, DASHBOARD_TARGET_LIMIT)

  const deferredDefaultTargets = Array.from(uniqueDefaultTargets.values()).slice(
    immediateDefaultTargetCount,
    immediateDefaultTargetCount + DEFERRED_DEFAULT_TARGET_LIMIT,
  )

  const snapshotResults = await mapWithConcurrencyLimit(immediateTargets, SNAPSHOT_CONCURRENCY_LIMIT, async (target) => {
    try {
      return await getNormalizedMarketData(target)
    } catch {
      return null
    }
  })
  const snapshots = snapshotResults
    .filter((snapshot): snapshot is NormalizedMarketData => snapshot !== null)

  if (deferredDefaultTargets.length > 0) {
    void mapWithConcurrencyLimit(deferredDefaultTargets, SNAPSHOT_CONCURRENCY_LIMIT, async (target) => {
      try {
        await getNormalizedMarketData(target)
      } catch (error) {
        logMarketEvent("snapshot.cache.deferred_refresh_error", {
          key: toSnapshotKey(target),
          error: error instanceof Error ? error.message : "unknown_error",
        })
      }
      return null
    })
  }

  if (snapshots.length === 0) {
    logMarketEvent("dashboard.load.complete", {
      durationMs: Date.now() - dashboardLoadStartedAt,
      snapshotCount: 0,
    })
    return createEmptyDashboard()
  }

  const groupedByBrand = snapshots.reduce<Record<string, NormalizedMarketData[]>>((acc, snapshot) => {
    if (!acc[snapshot.brand]) acc[snapshot.brand] = []
    acc[snapshot.brand].push(snapshot)
    return acc
  }, {})

  const sentimentByBrand: Record<string, number | null> = {}
  const sentimentCandidates = Object.entries(groupedByBrand)
    .sort((left, right) => right[1].length - left[1].length)
    .map(([brand]) => brand)
    .slice(0, MAX_GDELT_BRANDS_PER_LOAD)

  const cacheStateByBrand = await Promise.all(
    sentimentCandidates.map(async (brand) => ({
      brand,
      cacheState: await getSentimentCacheState(brand),
    })),
  )
  // Prioritize uncached or stale brands first so we spend limited GDELT calls where they improve data coverage most.
  const cachePriority: Record<CacheState, number> = {
    expired: 0,
    stale: 1,
    fresh: 2,
  }
  const prioritizedBrands = cacheStateByBrand
    .sort((left, right) => cachePriority[left.cacheState.state] - cachePriority[right.cacheState.state])
    .map((entry) => entry.brand)

  for (let index = 0; index < prioritizedBrands.length; index += 1) {
    const brand = prioritizedBrands[index]
    const shouldDefer = index >= IMMEDIATE_GDELT_BRANDS_PER_LOAD
    if (shouldDefer) {
      void getBrandSentimentScore(brand).catch(() => null)
      logMarketEvent("sentiment.request.deferred", { brand })
      continue
    }
    try {
      sentimentByBrand[brand] = await getBrandSentimentScore(brand)
    } catch (error) {
      sentimentByBrand[brand] = null
      if (error instanceof RateLimitError) {
        break
      }
    }

    if (index < IMMEDIATE_GDELT_BRANDS_PER_LOAD - 1 && index < prioritizedBrands.length - 1) {
      await sleep(SENTIMENT_REQUEST_SPACING_MS)
    }
  }

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

  logMarketEvent("dashboard.load.complete", {
    durationMs: Date.now() - dashboardLoadStartedAt,
    snapshotCount: snapshots.length,
    brandCount: brandIndices.length,
  })

  return {
    brandIndices,
    topMovers,
    updatedAt: updatedAt || nowIso(),
  }
}

function queueDashboardRefresh(cacheKey: string, watches: Watch[]) {
  if (dashboardInflightRequests.has(cacheKey)) return
  const refreshRequest = computeMarketDashboardData(watches)
    .then(async (dashboard) => {
      await setPersistentDashboardCache(cacheKey, dashboard)
      return dashboard
    })
    .catch(() => (
      dashboardMemoryCache.get(cacheKey)?.data
      ?? createEmptyDashboard()
    ))
    .finally(() => {
      dashboardInflightRequests.delete(cacheKey)
    })
  dashboardInflightRequests.set(cacheKey, refreshRequest)
  logMarketEvent("dashboard.cache.refresh_queued", { key: cacheKey })
}

export async function getMarketDashboardData(watches: Watch[]): Promise<MarketDashboardData> {
  const dashboardKey = buildDashboardCacheStorageKey(buildDashboardWatchSignature(watches))
  const cached = await getDashboardCacheState(dashboardKey)
  if (cached.state === "fresh" && cached.value) return cached.value

  const inflight = dashboardInflightRequests.get(dashboardKey)
  if (inflight) {
    if (cached.value) return cached.value
    return inflight
  }

  if (cached.state === "stale" && cached.value) {
    queueDashboardRefresh(dashboardKey, watches)
    return cached.value
  }

  const request = computeMarketDashboardData(watches)
    .then(async (dashboard) => {
      await setPersistentDashboardCache(dashboardKey, dashboard)
      return dashboard
    })
    .finally(() => {
      dashboardInflightRequests.delete(dashboardKey)
    })
  dashboardInflightRequests.set(dashboardKey, request)
  return request
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
