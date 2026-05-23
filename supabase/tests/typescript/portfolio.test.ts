import { describe, expect, it, vi } from 'vitest'
import { getPortfolioSummary, listPortfolioBrandAllocations } from '@/lib/db/portfolio'

describe('portfolio persistence helpers', () => {
  it('retrieves a single portfolio summary by user id', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        user_id: 'user-1',
        watch_count: 3,
        total_cost: 28000,
        total_estimated_value: 31500,
        average_return_percent: 8.4,
        last_updated_at: '2024-03-01T00:00:00.000Z',
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
      watchCount: 3,
      totalCost: 28000,
      totalEstimatedValue: 31500,
      averageReturnPercent: 8.4,
      lastUpdatedAt: '2024-03-01T00:00:00.000Z',
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
})
