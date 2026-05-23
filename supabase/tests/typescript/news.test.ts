import { describe, expect, it, vi } from 'vitest'
import { getNewsCache, getNewsCacheKey, upsertNewsPreferences } from '@/lib/db/news'

describe('news persistence helpers', () => {
  it('creates stable cache keys for shared news feeds', () => {
    expect(getNewsCacheKey('feed_all')).toBe('news-feed:global:feed_all')
  })

  it('reads the shared news cache by cache key', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'cache-1',
        cache_key: 'feed_all',
        articles: [],
        article_count: 0,
        cached_at: '2024-04-01T00:00:00.000Z',
        expires_at: '2024-04-01T00:30:00.000Z',
      },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    const cache = await getNewsCache({ from } as never)

    expect(eq).toHaveBeenCalledWith('cache_key', 'feed_all')
    expect(cache?.articleCount).toBe(0)
  })

  it('stores personalized news preferences by user id', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        user_id: 'user-1',
        enabled_sources: ['hodinkee'],
        muted_sources: [],
        preferred_tags: ['market'],
        sort_mode: 'recent',
        updated_at: '2024-04-01T00:00:00.000Z',
      },
      error: null,
    })
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))

    const preferences = await upsertNewsPreferences(
      { from } as never,
      {
        userId: 'user-1',
        enabledSources: ['hodinkee'],
        mutedSources: [],
        preferredTags: ['market'],
        sortMode: 'recent',
      },
    )

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', sort_mode: 'recent' }),
      { onConflict: 'user_id' },
    )
    expect(preferences.userId).toBe('user-1')
  })
})
