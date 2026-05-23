import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { NewsArticle } from '@/lib/types'
import type { Database, TableInsert, TableRow } from '@/lib/supabase/types'
import { createCacheKey } from '@/lib/cache/strategy'

export interface CachedNewsFeed {
  userId: string
  dependencyHash: string
  cachedAt: string
  updatedAt: string
  articles: NewsArticle[]
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapArticle(row: TableRow<'news_articles'>): NewsArticle {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    url: row.url,
    imageUrl: row.image_url,
    source: row.source,
    sourceIcon: row.source_icon,
    publishedAt: row.published_at,
    brands: row.brands,
    tags: row.tags,
    relevanceScore: row.canonical_score,
  }
}

function toArticleInsert(article: NewsArticle): TableInsert<'news_articles'> {
  return {
    id: article.id,
    title: article.title,
    summary: article.summary,
    url: article.url,
    image_url: article.imageUrl,
    source: article.source,
    source_icon: article.sourceIcon,
    published_at: article.publishedAt,
    brands: article.brands,
    tags: article.tags,
    canonical_score: article.relevanceScore,
  }
}

export function getNewsCacheKey(userId: string, dependencyHash: string): string {
  return createCacheKey('news-feed', userId, dependencyHash)
}

export async function listNewsArticles(
  client: Pick<SupabaseClient<Database>, 'from'>,
  brands?: string[],
  limit = 20,
): Promise<NewsArticle[]> {
  let query = client
    .from('news_articles')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (brands && brands.length > 0) {
    query = query.overlaps('brands', brands)
  }

  const { data, error } = await query
  throwIfError(error)
  return (data ?? []).map(mapArticle)
}

export async function upsertNewsArticles(
  client: Pick<SupabaseClient<Database>, 'from'>,
  articles: NewsArticle[],
): Promise<NewsArticle[]> {
  const { data, error } = await client
    .from('news_articles')
    .upsert(articles.map(toArticleInsert), { onConflict: 'url' })
    .select('*')

  throwIfError(error)
  return (data ?? []).map(mapArticle)
}

export async function getCachedNewsFeed(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
): Promise<CachedNewsFeed | null> {
  const { data, error } = await client
    .from('user_news_feed_cache')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  throwIfError(error)
  if (!data) {
    return null
  }

  return {
    userId: data.user_id,
    dependencyHash: data.dependency_hash,
    cachedAt: data.cached_at,
    updatedAt: data.updated_at,
    articles: (data.articles as NewsArticle[]) ?? [],
  }
}

export async function cacheNewsFeed(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  dependencyHash: string,
  articles: NewsArticle[],
): Promise<CachedNewsFeed> {
  const { data, error } = await client
    .from('user_news_feed_cache')
    .upsert({ user_id: userId, dependency_hash: dependencyHash, articles }, { onConflict: 'user_id' })
    .select('*')
    .single()

  throwIfError(error)
  return {
    userId: data.user_id,
    dependencyHash: data.dependency_hash,
    cachedAt: data.cached_at,
    updatedAt: data.updated_at,
    articles: (data.articles as NewsArticle[]) ?? [],
  }
}
