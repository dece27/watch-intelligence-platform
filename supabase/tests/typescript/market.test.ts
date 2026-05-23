import { describe, expect, it, vi } from 'vitest'
import { getMarketDataCache, listBrandIndexes, upsertMarketPrices } from '@/lib/db/market'

describe('market persistence helpers', () => {
  it('maps latest prices into chart-friendly brand indexes', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { brand: 'Rolex', reference: '126610LN', price_usd: 12110, source: 'seed', condition: 'Excellent', recorded_at: '2024-04-01T00:00:00.000Z' },
      ],
      error: null,
    })
    const select = vi.fn(() => ({ order }))
    const from = vi.fn(() => ({ select }))

    const indexes = await listBrandIndexes({ from } as never)

    expect(indexes).toEqual([{ brand: 'Rolex', currentIndex: 12110, trend: [12110] }])
  })

  it('inserts market prices as history rows', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [
        { brand: 'Rolex', reference: '126610LN', price_usd: 12110, source: 'seed', condition: 'Excellent', recorded_at: '2024-04-01T00:00:00.000Z' },
      ],
      error: null,
    })
    const insert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ insert }))

    await upsertMarketPrices(
      { from } as never,
      [{ brand: 'Rolex', reference: '126610LN', priceUsd: 12110, source: 'seed', condition: 'Excellent' }],
    )

    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ brand: 'Rolex', reference: '126610LN', price_usd: 12110 }),
    ])
  })

  it('reads cached market payloads by cache key', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'cache-1',
        cache_key: 'market:rolex:126610ln',
        data: { priceUsd: 12110 },
        source: 'seed',
        computed_at: '2024-04-01T00:00:00.000Z',
        expires_at: '2024-04-01T00:15:00.000Z',
      },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    const cache = await getMarketDataCache({ from } as never, 'market:rolex:126610ln')

    expect(eq).toHaveBeenCalledWith('cache_key', 'market:rolex:126610ln')
    expect(cache?.cacheKey).toBe('market:rolex:126610ln')
  })
})
