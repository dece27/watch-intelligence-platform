import { describe, expect, it, vi } from 'vitest'
import { clearDeals, getDealCacheKey, listDeals, upsertDeals } from '@/lib/db/deals'

describe('deals persistence helpers', () => {
  it('generates user-scoped cache keys for deal feeds', () => {
    expect(getDealCacheKey('user-1', 'Rolex')).toBe('deal-matches:user-1:Rolex')
  })

  it('lists deals ordered by match score and recency', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null })
    const secondOrder = vi.fn(() => ({ limit }))
    const firstOrder = vi.fn(() => ({ order: secondOrder }))
    const eq = vi.fn(() => ({ order: firstOrder }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    await listDeals({ from } as never, 'user-1', 25)

    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(firstOrder).toHaveBeenCalledWith('match_score', { ascending: false })
    expect(secondOrder).toHaveBeenCalledWith('listed_at', { ascending: false })
  })

  it('upserts on the composite user/source/external key', async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null })
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))

    await upsertDeals(
      { from } as never,
      'user-1',
      [{
        id: 'deal-1',
        brand: 'Rolex',
        model: 'Explorer II',
        price: 9800,
        discount: 7,
        condition: 'excellent',
        seller: 'Trusted Seller',
        location: 'Paris',
        matchScore: 91,
        userId: 'user-1',
      }],
    )

    expect(upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ user_id: 'user-1', external_id: 'deal-1' })],
      { onConflict: 'user_id,source,external_id' },
    )
  })

  it('clears only the current user deal rows', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const deleteFn = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ delete: deleteFn }))

    await clearDeals({ from } as never, 'user-1')

    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
  })
})
