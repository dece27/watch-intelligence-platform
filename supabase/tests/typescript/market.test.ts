import { describe, expect, it, vi } from 'vitest'
import { listAuctionResults, listBrandIndexes, upsertMarketSnapshots } from '@/lib/db/market'

describe('market persistence helpers', () => {
  it('maps latest market snapshots into chart-friendly brand indexes', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          brand: 'Rolex',
          snapshot_date: '2024-04-01',
          current_index: 121.1,
          sentiment_score: 8.1,
          price_change_percent: 2.3,
          source: 'seed',
          metadata: {},
          created_at: '2024-04-01T00:00:00.000Z',
        },
      ],
      error: null,
    })
    const select = vi.fn(() => ({ order }))
    const from = vi.fn(() => ({ select }))

    const indexes = await listBrandIndexes({ from } as never)

    expect(indexes).toEqual([{ brand: 'Rolex', currentIndex: 121.1, trend: [8.1] }])
  })

  it('upserts market snapshots on the natural brand/date key', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [
        {
          brand: 'Rolex',
          snapshot_date: '2024-04-01',
          current_index: 121.1,
          sentiment_score: 8.1,
          price_change_percent: 2.3,
          source: 'seed',
          metadata: {},
          created_at: '2024-04-01T00:00:00.000Z',
        },
      ],
      error: null,
    })
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))

    await upsertMarketSnapshots(
      { from } as never,
      [{ brand: 'Rolex', snapshotDate: '2024-04-01', currentIndex: 121.1, sentimentScore: 8.1, priceChangePercent: 2.3 }],
    )

    expect(upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ brand: 'Rolex', snapshot_date: '2024-04-01' })],
      { onConflict: 'brand,snapshot_date' },
    )
  })

  it('filters auction results by brand when provided', async () => {
    const limit = vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }))
    const order = vi.fn(() => ({ limit }))
    const select = vi.fn(() => ({ order }))
    const from = vi.fn(() => ({ select }))

    await listAuctionResults({ from } as never, ['Rolex'], 10)

    expect(from).toHaveBeenCalledWith('auction_results')
  })
})
