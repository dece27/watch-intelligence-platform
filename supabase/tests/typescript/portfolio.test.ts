import { describe, expect, it, vi } from 'vitest'
import { getPortfolioSummary, listPortfolioBrandAllocations, upsertPortfolioSnapshot } from '@/lib/db/portfolio'

describe('portfolio persistence helpers', () => {
  it('retrieves the latest portfolio summary by user id', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        user_id: 'user-1',
        snapshot_date: '2024-03-01',
        total_cost_basis: 28000,
        total_market_value: 31500,
        watch_count: 3,
        brand_breakdown: { Rolex: 2 },
        return_percent: 12.5,
        created_at: '2024-03-01T00:00:00.000Z',
      },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    const summary = await getPortfolioSummary({ from } as never, 'user-1')

    expect(from).toHaveBeenCalledWith('portfolio_snapshot')
    expect(summary).toEqual({
      userId: 'user-1',
      snapshotDate: '2024-03-01',
      totalCostBasis: 28000,
      totalMarketValue: 31500,
      watchCount: 3,
      brandBreakdown: { Rolex: 2 },
      returnPercent: 12.5,
      createdAt: '2024-03-01T00:00:00.000Z',
    })
  })

  it('orders brand allocations by highest percentage first', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { user_id: 'user-1', brand: 'Rolex', watch_count: 2, total_value: 22000, allocation_percent: 70 },
        { user_id: 'user-1', brand: 'Omega', watch_count: 1, total_value: 9500, allocation_percent: 30 },
      ],
      error: null,
    })
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    const allocations = await listPortfolioBrandAllocations({ from } as never, 'user-1')

    expect(order).toHaveBeenCalledWith('allocation_percent', { ascending: false })
    expect(allocations.map((entry) => entry.brand)).toEqual(['Rolex', 'Omega'])
  })

  it('upserts portfolio snapshots on the user/date key', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'snapshot-1',
        user_id: 'user-1',
        snapshot_date: '2024-03-01',
        total_cost_basis: 28000,
        total_market_value: 31500,
        watch_count: 3,
        brand_breakdown: { Rolex: 2 },
      },
      error: null,
    })
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))

    await upsertPortfolioSnapshot(
      { from } as never,
      {
        userId: 'user-1',
        snapshotDate: '2024-03-01',
        totalCostBasis: 28000,
        totalMarketValue: 31500,
        watchCount: 3,
        brandBreakdown: { Rolex: 2 },
      },
    )

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', snapshot_date: '2024-03-01' }),
      { onConflict: 'user_id,snapshot_date' },
    )
  })
})
