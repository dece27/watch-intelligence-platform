import { createHash } from 'node:crypto'
import Parser from 'rss-parser'
import { createClient } from '@supabase/supabase-js'

const RSS_FEED_SOURCES = [
  { id: 'hodinkee', name: 'Hodinkee', icon: 'H', url: 'https://www.hodinkee.com/feed' },
  { id: 'fratello', name: 'Fratello', icon: 'FR', url: 'https://www.fratellowatches.com/feed' },
  { id: 'monochrome', name: 'Monochrome', icon: 'MC', url: 'https://monochromewatches.com/feed' },
  { id: 'wornandwound', name: 'Worn & Wound', icon: 'WW', url: 'https://wornandwound.com/feed' },
  { id: 'watchpro', name: 'WatchPro', icon: 'WP', url: 'https://www.watchpro.com/feed/' },
  { id: 'sjx', name: 'SJX Watches', icon: 'SJ', url: 'https://sjx.sg/feed' },
  { id: 'ablogtowatch', name: 'aBlogtoWatch', icon: 'AB', url: 'https://www.ablogtowatch.com/feed/' },
  { id: 'timeandtide', name: 'Time & Tide', icon: 'TT', url: 'https://timeandtidewatches.com/feed' },
  { id: 'deployant', name: 'Deployant', icon: 'DP', url: 'https://deployant.com/feed' },
  { id: 'watchtime', name: 'WatchTime', icon: 'WT', url: 'https://www.watchtime.com/feed/' },
  { id: 'hautetime', name: 'Haute Time', icon: 'HT', url: 'https://www.hautetime.com/feed/' },
  { id: 'crowncaliber', name: 'Crown & Caliber', icon: 'CC', url: 'https://crownandcaliber.com/feed' },
  { id: 'thetimebum', name: 'The Time Bum', icon: 'TB', url: 'https://thetimebum.com/feed' },
  { id: 'oracletime', name: 'Oracle Time', icon: 'OT', url: 'https://oracletime.com/feed' },
  { id: 'watchcrunch', name: 'WatchCrunch', icon: 'WC', url: 'https://www.watchcrunch.com/news/feed' },
  { id: 'quillandpad', name: 'Quill & Pad', icon: 'QP', url: 'https://quillandpad.com/feed' },
  { id: 'horologium', name: 'Horologium', icon: 'HL', url: 'https://horologium.com/feed/' },
]

const WATCH_BRANDS = [
  'Rolex', 'Patek Philippe', 'Audemars Piguet', 'AP', 'IWC', 'Omega', 'Cartier',
  'Jaeger-LeCoultre', 'Vacheron Constantin', 'F.P. Journe', 'Grand Seiko', 'Breitling', 'Tudor',
  'Tag Heuer', 'Longines', 'Seiko', 'Citizen', 'Hublot', 'Richard Mille', 'A. Lange & Söhne',
  'Blancpain', 'Breguet', 'Girard-Perregaux', 'Nomos', 'Zenith', 'Doxa', 'Fortis', 'H. Moser & Cie',
  'Czapek', 'MB&F', 'Urwerk',
]

const TAG_PATTERNS = [
  { pattern: /new\s+release/i, tag: 'new release' },
  { pattern: /limited\s+edition/i, tag: 'limited edition' },
  { pattern: /auction/i, tag: 'auction' },
  { pattern: /investment/i, tag: 'investment' },
  { pattern: /\breview\b/i, tag: 'review' },
  { pattern: /vintage/i, tag: 'vintage' },
  { pattern: /interview/i, tag: 'interview' },
  { pattern: /\bmarket\b|\bprice\b|\bsecondary\b/i, tag: 'market' },
  { pattern: /watch\s+fair|watches\s+and\s+wonders|baselworld|sihh/i, tag: 'watch fair' },
  { pattern: /collaboration|collab/i, tag: 'collaboration' },
]

function getOptionalEnv(name) {
  return process.env[name]?.trim() || null
}

function createServiceClient() {
  return createClient(getOptionalEnv('SUPABASE_URL'), getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stripHtml(value) {
  const htmlEntities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
  }

  return (value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, (entity) => htmlEntities[entity.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractImageUrl(item) {
  const candidates = [
    item.enclosure?.url,
    item.image?.url,
    item.thumbnail,
    item['media:thumbnail']?.url,
    item['media:content']?.url,
    Array.isArray(item.enclosure) ? item.enclosure[0]?.url : undefined,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
      return candidate
    }
  }

  const htmlCandidates = [item['content:encoded'], item.content, item.summary]
  for (const html of htmlCandidates) {
    if (typeof html !== 'string') continue
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
    if (match?.[1]?.startsWith('http')) {
      return match[1]
    }
  }

  return null
}

function extractBrandsAndTags(title, summary) {
  const text = `${title} ${summary}`
  const brands = WATCH_BRANDS.filter((brand) => {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
  })

  const tags = []
  for (const { pattern, tag } of TAG_PATTERNS) {
    if (pattern.test(text) && !tags.includes(tag)) {
      tags.push(tag)
    }
  }

  return {
    brands: [...new Set(brands)],
    tags,
  }
}

function normalizePublishedAt(value) {
  const parsed = value ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString()
}

function normalizeArticle(item, source) {
  const url = typeof item.link === 'string' ? item.link.trim() : ''
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  if (!url.startsWith('http') || !title) {
    return null
  }

  const summarySource = item.contentSnippet || item.summary || item.content || item['content:encoded'] || ''
  const summary = stripHtml(summarySource).slice(0, 280)
  const { brands, tags } = extractBrandsAndTags(title, summary)

  return {
    id: sha256(url),
    title,
    summary,
    url,
    imageUrl: extractImageUrl(item),
    source: source.name,
    sourceIcon: source.icon,
    publishedAt: normalizePublishedAt(item.isoDate || item.pubDate),
    brands,
    tags,
  }
}

async function fetchSource(parser, source) {
  const response = await fetch(source.url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) {
    throw new Error(`${source.name} returned HTTP ${response.status}`)
  }

  const xml = await response.text()
  const feed = await parser.parseString(xml)
  return (feed.items || [])
    .map((item) => normalizeArticle(item, source))
    .filter(Boolean)
}

async function main() {
  const supabaseUrl = getOptionalEnv('SUPABASE_URL')
  const supabaseServiceRoleKey = getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.log('Skipping: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured')
    return
  }

  const parser = new Parser({
    customFields: {
      item: ['content:encoded', 'media:content', 'media:thumbnail'],
    },
  })
  const supabase = createServiceClient()

  const results = await Promise.allSettled(RSS_FEED_SOURCES.map((source) => fetchSource(parser, source)))
  const articlesById = new Map()
  let successCount = 0

  results.forEach((result) => {
    if (result.status !== 'fulfilled') {
      console.error(result.reason instanceof Error ? result.reason.message : String(result.reason))
      return
    }

    successCount += 1
    for (const article of result.value) {
      const existing = articlesById.get(article.id)
      if (!existing || article.publishedAt > existing.publishedAt) {
        articlesById.set(article.id, article)
      }
    }
  })

  const articles = Array.from(articlesById.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

  const { error } = await supabase
    .from('news_cache')
    .upsert(
      {
        cache_key: 'feed_all',
        articles,
        cached_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key' },
    )

  if (error) {
    throw error
  }

  console.log(`Refreshed ${articles.length} articles from ${successCount}/${RSS_FEED_SOURCES.length} sources`)
}

await main()
