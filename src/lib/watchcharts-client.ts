export interface WatchChartsClientConfig {
  apiKey?: string
  baseURL?: string
  timeoutMs?: number
  apiKeyHeader?: string
}

export interface WatchChartsSearchParams {
  query: string
  brand?: string
  model?: string
  page?: number
  limit?: number
}

export interface WatchChartsEstimateResponse {
  id: string
  brand: string
  model: string
  referenceNumber?: string
  estimate: number
  currency: string
  updatedAt: string
}

export interface WatchChartsSearchResult {
  id: string
  brand: string
  model: string
  referenceNumber?: string
  year?: number
}

export interface WatchChartsSearchResponse {
  results: WatchChartsSearchResult[]
  total: number
  page: number
  limit: number
}

export interface WatchChartsLookupInput {
  brand: string
  model: string
  referenceNumber?: string
}

const DEFAULT_BASE_URL = 'https://api.watchcharts.com'
const WATCH_ID_CACHE_STORAGE_KEY = 'watchcharts_watch_id_cache_v1'

export class WatchChartsClient {
  private readonly baseURL: string
  private readonly timeoutMs: number
  private readonly headers: Record<string, string>
  private readonly hasCredentials: boolean
  private readonly watchIdCache = new Map<string, string>()

  constructor({
    apiKey = import.meta.env.VITE_WATCHCHARTS_API_KEY,
    baseURL = import.meta.env.VITE_WATCHCHARTS_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs = 15000,
    apiKeyHeader = 'X-API-Key',
  }: WatchChartsClientConfig = {}) {
    this.baseURL = baseURL
    this.timeoutMs = timeoutMs
    this.headers = {
      Accept: 'application/json',
    }

    const trimmedKey = apiKey?.trim()
    this.hasCredentials = Boolean(trimmedKey)
    if (trimmedKey) {
      this.headers[apiKeyHeader] = trimmedKey
    }

    this.loadWatchIdCacheFromStorage()
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined'
  }

  private loadWatchIdCacheFromStorage(): void {
    if (!this.isBrowser()) return
    try {
      const raw = window.localStorage.getItem(WATCH_ID_CACHE_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, string>
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof key === 'string' && typeof value === 'string' && key && value) {
          this.watchIdCache.set(key, value)
        }
      }
    } catch {
      // no-op
    }
  }

  private persistWatchIdCache(): void {
    if (!this.isBrowser()) return
    try {
      const payload = Object.fromEntries(this.watchIdCache.entries())
      window.localStorage.setItem(WATCH_ID_CACHE_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // no-op
    }
  }

  private buildLookupKeys(input: WatchChartsLookupInput): string[] {
    const brand = input.brand.trim().toLowerCase()
    const model = input.model.trim().toLowerCase()
    const reference = input.referenceNumber?.trim().toLowerCase() || ''
    return [
      reference ? `ref:${reference}` : '',
      `brand-model:${brand}|${model}`,
      `query:${reference || `${brand} ${model}`}`,
    ].filter(Boolean)
  }

  private setCachedWatchId(input: WatchChartsLookupInput, watchId: string): void {
    const normalizedWatchId = watchId.trim()
    if (!normalizedWatchId) return
    for (const key of this.buildLookupKeys(input)) {
      this.watchIdCache.set(key, normalizedWatchId)
    }
    this.persistWatchIdCache()
  }

  private getCachedWatchId(input: WatchChartsLookupInput): string | null {
    for (const key of this.buildLookupKeys(input)) {
      const cached = this.watchIdCache.get(key)
      if (cached) return cached
    }
    return null
  }

  private async request<T>(method: string, path: string, params?: object): Promise<T> {
    const url = new URL(path, this.baseURL)
    
    if (params && method === 'GET') {
      Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: this.headers,
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async searchWatches(params: WatchChartsSearchParams): Promise<WatchChartsSearchResponse> {
    return this.request<WatchChartsSearchResponse>('GET', '/watches/search', params)
  }

  async getEstimatedValue(watchId: string): Promise<WatchChartsEstimateResponse> {
    return this.request<WatchChartsEstimateResponse>('GET', `/watches/${watchId}/estimate`)
  }

  async getMarketValue(input: WatchChartsLookupInput): Promise<number | null> {
    if (!this.hasCredentials) return null
    const cachedWatchId = this.getCachedWatchId(input)
    if (cachedWatchId) {
      try {
        const estimateResponse = await this.getEstimatedValue(cachedWatchId)
        return estimateResponse.estimate
      } catch {
        // cache miss/stale id; continue with search flow
      }
    }

    const query = input.referenceNumber || `${input.brand} ${input.model}`

    const searchResponse = await this.searchWatches({
      query,
      brand: input.brand,
      model: input.model,
      limit: 1,
    })

    const firstMatch = searchResponse.results[0]
    if (!firstMatch) {
      return null
    }

    this.setCachedWatchId(input, firstMatch.id)

    const estimateResponse = await this.getEstimatedValue(firstMatch.id)
    return estimateResponse.estimate
  }
}

export const watchChartsClient = new WatchChartsClient()