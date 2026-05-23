export type CacheNamespace =
  | 'portfolio-summary'
  | 'market-snapshots'
  | 'auction-results'
  | 'deal-matches'
  | 'news-feed'

const CACHE_TTL_MS: Record<CacheNamespace, number> = {
  'portfolio-summary': 60_000,
  'market-snapshots': 15 * 60_000,
  'auction-results': 60 * 60_000,
  'deal-matches': 15 * 60_000,
  'news-feed': 30 * 60_000,
}

export function getCacheTtlMs(namespace: CacheNamespace): number {
  return CACHE_TTL_MS[namespace]
}

export function createCacheKey(namespace: CacheNamespace, userId?: string, ...parts: string[]): string {
  return [namespace, userId ?? 'global', ...parts.filter(Boolean)].join(':')
}

export function isCacheFresh(namespace: CacheNamespace, cachedAt?: string | null, now = Date.now()): boolean {
  if (!cachedAt) {
    return false
  }

  const parsed = Date.parse(cachedAt)
  if (Number.isNaN(parsed)) {
    return false
  }

  return now - parsed < getCacheTtlMs(namespace)
}

export function getCacheExpiresAt(namespace: CacheNamespace, cachedAt: string): string {
  return new Date(Date.parse(cachedAt) + getCacheTtlMs(namespace)).toISOString()
}
