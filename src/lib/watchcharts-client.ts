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

export class WatchChartsClient {
  private readonly baseURL: string
  private readonly timeoutMs: number
  private readonly headers: Record<string, string>

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

    if (apiKey) {
      this.headers[apiKeyHeader] = apiKey
    }
  }

  private async request<T>(method: string, path: string, params?: Record<string, any>): Promise<T> {
    const url = new URL(path, this.baseURL)
    
    if (params && method === 'GET') {
      Object.entries(params).forEach(([key, value]) => {
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

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  async searchWatches(params: WatchChartsSearchParams): Promise<WatchChartsSearchResponse> {
    return this.request<WatchChartsSearchResponse>('GET', '/watches/search', params)
  }

  async getEstimatedValue(watchId: string): Promise<WatchChartsEstimateResponse> {
    return this.request<WatchChartsEstimateResponse>('GET', `/watches/${watchId}/estimate`)
  }

  async getMarketValue(input: WatchChartsLookupInput): Promise<number | null> {
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

    const estimateResponse = await this.getEstimatedValue(firstMatch.id)
    return estimateResponse.estimate
  }
}

export const watchChartsClient = new WatchChartsClient()