import { Watch, NewsArticle, NewsCacheRecord } from "@/lib/types"

// ---------------------------------------------------------------------------
// Feed Source Definitions
// ---------------------------------------------------------------------------

export interface RssFeedSource {
  id: string
  name: string
  icon: string
  url: string
  tier: 1 | 2 | 3
}

export const RSS_FEED_SOURCES: RssFeedSource[] = [
  // Tier 1 — Premium editorial
  { id: 'hodinkee',     name: 'Hodinkee',         icon: 'H',  url: 'https://www.hodinkee.com/feed',              tier: 1 },
  { id: 'fratello',    name: 'Fratello',          icon: 'FR', url: 'https://www.fratellowatches.com/feed',       tier: 1 },
  { id: 'monochrome',  name: 'Monochrome',        icon: 'MC', url: 'https://monochromewatches.com/feed',        tier: 1 },
  { id: 'wornandwound',name: 'Worn & Wound',      icon: 'WW', url: 'https://wornandwound.com/feed',             tier: 1 },
  { id: 'watchpro',   name: 'WatchPro',           icon: 'WP', url: 'https://www.watchpro.com/feed/',            tier: 1 },
  { id: 'sjx',        name: 'SJX Watches',        icon: 'SJ', url: 'https://sjx.sg/feed',                      tier: 1 },
  // Tier 2 — Collector & enthusiast
  { id: 'ablogtowatch',name: 'aBlogtoWatch',      icon: 'AB', url: 'https://www.ablogtowatch.com/feed/',        tier: 2 },
  { id: 'timeandtide', name: 'Time & Tide',       icon: 'TT', url: 'https://timeandtidewatches.com/feed',      tier: 2 },
  { id: 'deployant',   name: 'Deployant',         icon: 'DP', url: 'https://deployant.com/feed',               tier: 2 },
  { id: 'watchtime',   name: 'WatchTime',         icon: 'WT', url: 'https://www.watchtime.com/feed/',          tier: 2 },
  { id: 'hautetime',   name: 'Haute Time',        icon: 'HT', url: 'https://www.hautetime.com/feed/',          tier: 2 },
  { id: 'crowncaliber',name: 'Crown & Caliber',   icon: 'CC', url: 'https://crownandcaliber.com/feed',         tier: 2 },
  { id: 'thetimebum',  name: 'The Time Bum',      icon: 'TB', url: 'https://thetimebum.com/feed',              tier: 2 },
  { id: 'oracletime',  name: 'Oracle Time',       icon: 'OT', url: 'https://oracletime.com/feed',              tier: 2 },
  // Tier 3 — Community & market
  { id: 'watchcrunch', name: 'WatchCrunch',       icon: 'WC', url: 'https://www.watchcrunch.com/news/feed',    tier: 3 },
  { id: 'quillandpad', name: 'Quill & Pad',       icon: 'QP', url: 'https://quillandpad.com/feed',             tier: 3 },
  { id: 'horologium',  name: 'Horologium',        icon: 'HL', url: 'https://horologium.com/feed/',             tier: 3 },
]

// ---------------------------------------------------------------------------
// Brand & Tag Extraction
// ---------------------------------------------------------------------------

export const WATCH_BRANDS = [
  "Rolex", "Patek Philippe", "Audemars Piguet", "AP", "IWC", "Omega", "Cartier",
  "Jaeger-LeCoultre", "Vacheron Constantin", "F.P. Journe", "Grand Seiko", "Breitling", "Tudor",
  "Tag Heuer", "Longines", "Seiko", "Citizen", "Hublot", "Richard Mille", "A. Lange & Söhne",
  "Blancpain", "Breguet", "Girard-Perregaux", "Nomos", "Zenith", "Doxa", "Fortis",
  "H. Moser & Cie", "Czapek", "MB&F", "Urwerk",
]

const TAG_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /new\s+release/i,                                              tag: 'new release'   },
  { pattern: /limited\s+edition/i,                                          tag: 'limited edition' },
  { pattern: /auction/i,                                                    tag: 'auction'        },
  { pattern: /investment/i,                                                 tag: 'investment'     },
  { pattern: /\breview\b/i,                                                 tag: 'review'         },
  { pattern: /vintage/i,                                                    tag: 'vintage'        },
  { pattern: /interview/i,                                                  tag: 'interview'      },
  { pattern: /\bmarket\b|\bprice\b|\bsecondary\b/i,                        tag: 'market'         },
  { pattern: /watch\s+fair|watches\s+and\s+wonders|baselworld|sihh/i,      tag: 'watch fair'     },
  { pattern: /collaboration|collab/i,                                       tag: 'collaboration'  },
]

export function extractBrandsAndTags(
  title: string,
  summary: string,
): { brands: string[]; tags: string[] } {
  const text = `${title} ${summary}`
  const brands = WATCH_BRANDS.filter((brand) => {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
  })
  const tags: string[] = []
  for (const { pattern, tag } of TAG_PATTERNS) {
    if (pattern.test(text) && !tags.includes(tag)) {
      tags.push(tag)
    }
  }
  return { brands: [...new Set(brands)], tags }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

async function sha256Hash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function cleanHtml(html: string): string {
  // Strip HTML tags first, then decode entities via DOMParser (single-pass, no double-unescape risk)
  const stripped = html.replace(/<[^>]+>/g, ' ')
  try {
    const doc = new DOMParser().parseFromString(stripped, 'text/html')
    return (doc.body.textContent ?? stripped).replace(/\s+/g, ' ').trim()
  } catch {
    return stripped.replace(/\s+/g, ' ').trim()
  }
}

function extractImageFromItem(item: Element, rawContent: string): string | null {
  // Try <enclosure>
  const enclosure = item.querySelector('enclosure')
  const enclosureUrl = enclosure?.getAttribute('url')
  const enclosureType = enclosure?.getAttribute('type') ?? ''
  if (enclosureUrl && enclosureType.startsWith('image/')) return enclosureUrl

  // Try <media:content>
  const mediaContent = item.querySelector('media\\:content, [medium="image"]')
  const mediaUrl = mediaContent?.getAttribute('url')
  if (mediaUrl?.startsWith('http')) return mediaUrl

  // Try <media:thumbnail>
  const mediaThumbnail = item.querySelector('media\\:thumbnail')
  const thumbUrl = mediaThumbnail?.getAttribute('url')
  if (thumbUrl?.startsWith('http')) return thumbUrl

  // Try first <img> in raw content
  const imgMatch = rawContent.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (imgMatch?.[1]?.startsWith('http')) return imgMatch[1]

  return null
}

// ---------------------------------------------------------------------------
// RSS Parsing
// ---------------------------------------------------------------------------

async function parseRssItem(
  item: Element,
  source: RssFeedSource,
): Promise<Omit<NewsArticle, 'relevanceScore'> | null> {
  const title = item.querySelector('title')?.textContent?.trim() ?? ''
  if (!title) return null

  const linkEl = item.querySelector('link')
  const url = linkEl?.getAttribute('href') ?? linkEl?.textContent?.trim() ?? ''
  if (!url.startsWith('http')) return null

  const rawContent =
    item.querySelector('content\\:encoded')?.textContent ??
    item.querySelector('description')?.textContent ??
    item.querySelector('summary')?.textContent ??
    ''

  const cleaned = cleanHtml(rawContent)
  const summary = cleaned.slice(0, 280)
  const imageUrl = extractImageFromItem(item, rawContent)

  const pubDateText =
    item.querySelector('pubDate')?.textContent?.trim() ??
    item.querySelector('published')?.textContent?.trim() ??
    item.querySelector('updated')?.textContent?.trim() ??
    ''
  const parsed = pubDateText ? new Date(pubDateText) : null
  const publishedAt = parsed && !isNaN(parsed.getTime())
    ? parsed.toISOString()
    : new Date().toISOString()

  const id = await sha256Hash(url)
  const { brands, tags } = extractBrandsAndTags(title, summary)

  return { id, title, summary, url, imageUrl, source: source.name, sourceIcon: source.icon, publishedAt, brands, tags }
}

const CORS_PROXY = 'https://corsproxy.io/?url='

async function fetchAndParseRssFeed(
  source: RssFeedSource,
): Promise<Omit<NewsArticle, 'relevanceScore'>[]> {
  const proxyUrl = `${CORS_PROXY}${encodeURIComponent(source.url)}`
  const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) {
    throw new Error(`${source.name} returned HTTP ${response.status}`)
  }
  const text = await response.text()
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error(`XML parse error for ${source.name}`)
  }
  const items = Array.from(doc.querySelectorAll('item, entry'))
  const articles: Omit<NewsArticle, 'relevanceScore'>[] = []
  for (const item of items) {
    const parsed = await parseRssItem(item, source)
    if (parsed) articles.push(parsed)
  }
  return articles
}

// ---------------------------------------------------------------------------
// Relevance Scoring
// ---------------------------------------------------------------------------

interface UserProfile {
  ownedBrands: string[]
  ownedReferences: string[]
}

function buildUserProfile(watches: Watch[]): UserProfile {
  return {
    ownedBrands: [...new Set(watches.map((w) => w.brand))],
    ownedReferences: watches.flatMap((w) => (w.referenceNumber ? [w.referenceNumber] : [])),
  }
}

function scoreArticle(article: Omit<NewsArticle, 'relevanceScore'>, profile: UserProfile): number {
  let score = 50

  // Recency bonus (max +20)
  const ageDays = (Date.now() - new Date(article.publishedAt).getTime()) / 86_400_000
  if (ageDays < 1) score += 20
  else if (ageDays < 3) score += 15
  else if (ageDays < 7) score += 10
  else if (ageDays < 14) score += 5
  else if (ageDays > 60) score -= 10

  // Tier bonus based on source — tier 1 sources score a bit higher
  const sourceDef = RSS_FEED_SOURCES.find((s) => s.name === article.source)
  if (sourceDef?.tier === 1) score += 5
  else if (sourceDef?.tier === 3) score -= 3

  // Brand match (max +30)
  const brandMatches = article.brands.filter((b) =>
    profile.ownedBrands.some((ob) => ob.toLowerCase() === b.toLowerCase()),
  ).length
  score += Math.min(brandMatches * 15, 30)

  // Reference match (max +20)
  const textLower = `${article.title} ${article.summary}`.toLowerCase()
  const refMatches = profile.ownedReferences.filter(
    (ref) => ref.length > 3 && textLower.includes(ref.toLowerCase()),
  ).length
  score += Math.min(refMatches * 20, 20)

  // Tag boosts
  if (article.tags.includes('market') || article.tags.includes('investment')) score += 5
  if (article.tags.includes('auction')) score += 3

  return Math.max(0, Math.min(100, Math.round(score)))
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function sortAndLimit(
  articles: NewsArticle[],
  sort: 'recent' | 'relevant',
  limit: number,
): NewsArticle[] {
  return [...articles]
    .sort((a, b) => {
      if (sort === 'relevant' && b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore
      }
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    })
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Cache & Public API
// ---------------------------------------------------------------------------

const NEWS_CACHE_KEY = 'news_cache_feed_all'
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

export async function fetchNewsFeed(
  watches: Watch[] = [],
  options: { forceRefresh?: boolean; limit?: number; sort?: 'recent' | 'relevant' } = {},
): Promise<NewsArticle[]> {
  const { forceRefresh = false, limit = 60, sort = 'recent' } = options
  const profile = buildUserProfile(watches)

  // Return from cache if fresh enough
  if (!forceRefresh) {
    try {
      const cached = await window.spark.kv.get<NewsCacheRecord>(NEWS_CACHE_KEY)
      if (cached?.cachedAt) {
        const age = Date.now() - new Date(cached.cachedAt).getTime()
        if (age < CACHE_TTL_MS && cached.articles.length > 0) {
          const scored = cached.articles.map((a) => ({
            ...a,
            relevanceScore: scoreArticle(a, profile),
          }))
          return sortAndLimit(scored, sort, limit)
        }
      }
    } catch {
      // Cache miss — proceed to live fetch
    }
  }

  // Fetch all feeds concurrently; silently skip failures
  const results = await Promise.allSettled(
    RSS_FEED_SOURCES.map((source) => fetchAndParseRssFeed(source)),
  )
  const raw: Omit<NewsArticle, 'relevanceScore'>[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'rejected') {
      console.error(`[News] ${RSS_FEED_SOURCES[i].name} failed:`, r.reason)
    } else {
      raw.push(...r.value)
    }
  }

  // Deduplicate by id
  const seen = new Set<string>()
  const deduplicated = raw.filter((a) => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })

  // Sort by date for storage (scores are user-specific; recomputed on load)
  const sortedForCache = [...deduplicated].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  )

  // Persist to cache (strip per-user scores)
  try {
    await window.spark.kv.set<NewsCacheRecord>(NEWS_CACHE_KEY, {
      articles: sortedForCache,
      cachedAt: new Date().toISOString(),
    })
  } catch {
    // Non-fatal — continue
  }

  const scored: NewsArticle[] = deduplicated.map((a) => ({
    ...a,
    relevanceScore: scoreArticle(a, profile),
  }))
  return sortAndLimit(scored, sort, limit)
}

export async function refreshNewsFeed(watches: Watch[] = []): Promise<NewsArticle[]> {
  return fetchNewsFeed(watches, { forceRefresh: true })
}
