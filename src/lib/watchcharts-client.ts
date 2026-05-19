import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'

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
  private readonly client: AxiosInstance

  constructor({
    apiKey = import.meta.env.VITE_WATCHCHARTS_API_KEY,
    baseURL = import.meta.env.VITE_WATCHCHARTS_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs = 15000,
    apiKeyHeader = 'X-API-Key',
  }: WatchChartsClientConfig = {}) {
    this.client = axios.create({
      baseURL,
      timeout: timeoutMs,
      headers: {
        Accept: 'application/json',
      },
    })

    if (apiKey) {
      this.client.defaults.headers.common[apiKeyHeader] = apiKey
    }
  }

  async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.request<T>(config)
    return response.data
  }

  async searchWatches(params: WatchChartsSearchParams): Promise<WatchChartsSearchResponse> {
    return this.request<WatchChartsSearchResponse>({
      method: 'GET',
      url: '/watches/search',
      params,
    })
  }

  async getEstimatedValue(watchId: string): Promise<WatchChartsEstimateResponse> {
    return this.request<WatchChartsEstimateResponse>({
      method: 'GET',
      url: `/watches/${watchId}/estimate`,
    })
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