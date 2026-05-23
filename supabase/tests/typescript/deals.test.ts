import { describe, expect, it, vi } from 'vitest'
import { getDealCacheKey, listDealListings, removeSavedDeal, saveDeal, upsertDealListings } from '@/lib/db/deals'

describe('deals persistence helpers', () => {
  it('generates user-scoped cache keys for deal feeds', () => {
    expect(getDealCacheKey('user-1', 'Rolex')).toBe('deal-matches:user-1:Rolex')
  })

  it('lists active deals ordered by score and recency', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null })
    const secondOrder = vi.fn(() => ({ limit }))
    const firstOrder = vi.fn(() => ({ order: secondOrder }))
    const eq = vi.fn(() => ({ order: firstOrder }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    await listDealListings({ from } as never, 25)

    expect(eq).toHaveBeenCalledWith('is_active', true)
    expect(firstOrder).toHaveBeenCalledWith('deal_score', { ascending: false })
    expect(secondOrder).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('upserts listings by id', async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null })
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))

    await upsertDealListings(
      { from } as never,
      [{
        id: 'deal-1',
        brand: 'Rolex',
        model: 'Explorer II',
        reference: '226570',
        askingPrice: 9800,
        fairValue: 10400,
        hasBox: true,
        hasPapers: true,
        isActive: true,
      }],
    )

    expect(upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'deal-1', reference: '226570' })],
      { onConflict: 'id' },
    )
  })

  it('saves personalized deal snapshots by user and listing', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'saved-1',
        user_id: 'user-1',
        listing_id: 'deal-1',
        listing_snapshot: { brand: 'Rolex' },
        saved_at: '2024-04-01T00:00:00.000Z',
      },
      error: null,
    })
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))

    const saved = await saveDeal({ from } as never, 'user-1', 'deal-1', { brand: 'Rolex' })

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', listing_id: 'deal-1' }),
      { onConflict: 'user_id,listing_id' },
    )
    expect(saved.userId).toBe('user-1')
  })

  it('removes only the current user saved deal row', async () => {
    const eqListing = vi.fn().mockResolvedValue({ error: null })
    const eqUser = vi.fn(() => ({ eq: eqListing }))
    const deleteFn = vi.fn(() => ({ eq: eqUser }))
    const from = vi.fn(() => ({ delete: deleteFn }))

    await removeSavedDeal({ from } as never, 'user-1', 'deal-1')

    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqListing).toHaveBeenCalledWith('listing_id', 'deal-1')
  })
})
