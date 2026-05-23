import { describe, expect, it, vi } from 'vitest'
import { cacheNewsFeed, getNewsCacheKey, listNewsArticles } from '@/lib/db/news'

describe('news persistence helpers', () => {
  it('creates stable personalized cache keys', () => {
    expect(getNewsCacheKey('user-1', 'hash-123')).toBe('news-feed:user-1:hash-123')
  })

  it('filters canonical news by owned brands', async () => {
    const overlaps = vi.fn().mockResolvedValue({ data: [], error: null })
    const limit = vi.fn(() => ({ overlaps }))
    const order = vi.fn(() => ({ limit }))
    const select = vi.fn(() => ({ order }))
    const from = vi.fn(() => ({ select }))

    await listNewsArticles({ from } as never, ['Rolex'], 5)

    expect(overlaps).toHaveBeenCalledWith('brands', ['Rolex'])
  })

  it('stores personalized news cache rows by user id', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        user_id: 'user-1',
        dependency_hash: 'hash-123',
        cached_at: '2024-04-01T00:00:00.000Z',
        updated_at: '2024-04-01T00:00:00.000Z',
        articles: [{ id: 'article-1', title: 'Headline' }],
      },
      error: null,
    })
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))

    const cache = await cacheNewsFeed({ from } as never, 'user-1', 'hash-123', [{
      id: 'article-1',
      title: 'Headline',
      summary: 'Summary',
      url: 'https://example.com/article-1',
      imageUrl: null,
      source: 'WatchWire',
      sourceIcon: 'https://example.com/source.png',
      publishedAt: '2024-04-01T00:00:00.000Z',
      brands: ['Rolex'],
      tags: ['market'],
      relevanceScore: 8,
    }])

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', dependency_hash: 'hash-123' }),
      { onConflict: 'user_id' },
    )
    expect(cache.userId).toBe('user-1')
  })
})
