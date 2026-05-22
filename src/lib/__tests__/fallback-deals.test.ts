import { describe, expect, it } from 'vitest'
import { FALLBACK_DEALS } from '@/lib/fallback-deals'

describe('FALLBACK_DEALS', () => {
  it('contains unique IDs and expected fallback source labels', () => {
    const ids = FALLBACK_DEALS.map((deal) => deal.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const deal of FALLBACK_DEALS) {
      expect(deal.source).toBe('Chrono24 (fallback)')
      expect(deal.price).toBeGreaterThan(0)
      expect(deal.fairValue).toBeGreaterThan(0)
    }
  })

  it('keeps discount values consistent with price vs fair value', () => {
    for (const deal of FALLBACK_DEALS) {
      const expectedDiscount = Math.round((((deal.fairValue || 0) - deal.price) / (deal.fairValue || 1)) * 100)
      expect(deal.discount).toBe(expectedDiscount)
    }
  })
})
