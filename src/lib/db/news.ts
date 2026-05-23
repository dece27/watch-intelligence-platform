import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, TableInsert, TableRow } from '@/lib/supabase/types'
import { createCacheKey } from '@/lib/cache/strategy'

export interface NewsCacheRecord {
  id: string
  cacheKey: string
  articles: Json
  articleCount: number
  cachedAt: string
  expiresAt?: string
}

export interface NewsPreferenceRecord {
  userId: string
  enabledSources: string[]
  mutedSources: string[]
  preferredTags: string[]
  sortMode: Database['public']['Enums']['news_sort_mode']
  updatedAt: string
}

export interface SavedNewsRecord {
  id: string
  userId: string
  articleId: string
  article: Json
  savedAt: string
}

export interface NewsRelevanceScoreRecord {
  id: string
  articleId: string
  userId: string
  score?: number
  reason?: string
  scoredAt: string
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapNewsCache(row: TableRow<'news_cache'>): NewsCacheRecord {
  return {
    id: row.id,
    cacheKey: row.cache_key,
    articles: row.articles,
    articleCount: row.article_count ?? 0,
    cachedAt: row.cached_at,
    expiresAt: row.expires_at ?? undefined,
  }
}

function mapNewsPreference(row: TableRow<'news_preferences'>): NewsPreferenceRecord {
  return {
    userId: row.user_id,
    enabledSources: row.enabled_sources ?? [],
    mutedSources: row.muted_sources ?? [],
    preferredTags: row.preferred_tags ?? [],
    sortMode: row.sort_mode ?? 'relevant',
    updatedAt: row.updated_at,
  }
}

function mapSavedNews(row: TableRow<'news_saved'>): SavedNewsRecord {
  return {
    id: row.id,
    userId: row.user_id,
    articleId: row.article_id,
    article: row.article,
    savedAt: row.saved_at,
  }
}

function mapScore(row: TableRow<'news_relevance_scores'>): NewsRelevanceScoreRecord {
  return {
    id: row.id,
    articleId: row.article_id,
    userId: row.user_id,
    score: row.score ?? undefined,
    reason: row.reason ?? undefined,
    scoredAt: row.scored_at,
  }
}

function toCacheInsert(cacheKey: string, articles: Json): TableInsert<'news_cache'> {
  return {
    cache_key: cacheKey,
    articles,
  }
}

export function getNewsCacheKey(scope = 'feed_all'): string {
  return createCacheKey('news-feed', undefined, scope)
}

export async function getNewsCache(
  client: Pick<SupabaseClient<Database>, 'from'>,
  cacheKey = 'feed_all',
): Promise<NewsCacheRecord | null> {
  const { data, error } = await client
    .from('news_cache')
    .select('*')
    .eq('cache_key', cacheKey)
    .maybeSingle()

  throwIfError(error)
  return data ? mapNewsCache(data) : null
}

export async function upsertNewsCache(
  client: Pick<SupabaseClient<Database>, 'from'>,
  cacheKey: string,
  articles: Json,
): Promise<NewsCacheRecord> {
  const { data, error } = await client
    .from('news_cache')
    .upsert(toCacheInsert(cacheKey, articles), { onConflict: 'cache_key' })
    .select('*')
    .single()

  throwIfError(error)
  return mapNewsCache(data)
}

export async function getNewsPreferences(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
): Promise<NewsPreferenceRecord | null> {
  const { data, error } = await client
    .from('news_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  throwIfError(error)
  return data ? mapNewsPreference(data) : null
}

export async function upsertNewsPreferences(
  client: Pick<SupabaseClient<Database>, 'from'>,
  preferences: Omit<NewsPreferenceRecord, 'updatedAt'>,
): Promise<NewsPreferenceRecord> {
  const { data, error } = await client
    .from('news_preferences')
    .upsert(
      {
        user_id: preferences.userId,
        enabled_sources: preferences.enabledSources,
        muted_sources: preferences.mutedSources,
        preferred_tags: preferences.preferredTags,
        sort_mode: preferences.sortMode,
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single()

  throwIfError(error)
  return mapNewsPreference(data)
}

export async function scoreNewsArticle(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  articleId: string,
  score: number,
  reason?: string,
): Promise<NewsRelevanceScoreRecord> {
  const { data, error } = await client
    .from('news_relevance_scores')
    .upsert({ user_id: userId, article_id: articleId, score, reason: reason ?? null }, { onConflict: 'article_id,user_id' })
    .select('*')
    .single()

  throwIfError(error)
  return mapScore(data)
}

export async function saveNewsArticle(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  articleId: string,
  article: Json,
): Promise<SavedNewsRecord> {
  const { data, error } = await client
    .from('news_saved')
    .upsert({ user_id: userId, article_id: articleId, article }, { onConflict: 'user_id,article_id' })
    .select('*')
    .single()

  throwIfError(error)
  return mapSavedNews(data)
}

export async function listSavedNews(client: Pick<SupabaseClient<Database>, 'from'>, userId: string): Promise<SavedNewsRecord[]> {
  const { data, error } = await client
    .from('news_saved')
    .select('*')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false })

  throwIfError(error)
  return (data ?? []).map(mapSavedNews)
}
