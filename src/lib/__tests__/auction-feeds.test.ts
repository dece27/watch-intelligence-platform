import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRecentAuctionResults } from '@/lib/auction-feeds'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchRecentAuctionResults', () => {
  it('returns empty array when no references are provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(fetchRecentAuctionResults({ references: [] })).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('normalizes Christies/Phillips results, filters, sorts, and applies limit', async () => {
    const nowIso = new Date().toISOString()
    const olderIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const staleIso = new Date(Date.now() - 500 * 24 * 60 * 60 * 1000).toISOString()

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('christies.com/api/discoverywebsite/search/lotcards')) {
        return new Response(
          JSON.stringify({
            lots: [
              {
                title: 'Rolex GMT-Master II',
                sale_date_ISO: nowIso,
                price_realised: 'US$ 18,500',
                lot_url: '/lot/lot-123456',
                description: 'Estimate: US$ 15,000 - US$ 20,000',
                referenceNumber: '126710BLRO',
              },
              {
                title: 'Rolex GMT-Master old sale',
                sale_date_ISO: staleIso,
                price_realised: 'US$ 10,000',
                lot_url: '/lot/lot-111111',
                description: 'Old sale',
                referenceNumber: '126710BLRO',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }

      if (url.includes('phillips.com/api/search')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                title: 'Rolex GMT-Master II Pepsi',
                saleDate: olderIso,
                sold_for: '$17,900',
                detailUrl: '/detail/lot-999999',
                description: 'Estimate: $14,000 to $19,000',
                reference: '126710BLRO',
              },
              {
                title: 'Unrelated watch',
                saleDate: nowIso,
                sold_for: '$9,000',
                detailUrl: '/detail/lot-222222',
                description: 'No matching reference',
                reference: '000000',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const results = await fetchRecentAuctionResults({ references: ['126710BLRO'], limit: 2 })

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      house: "Christie's",
      lot: 'Rolex GMT-Master II',
      result: 18500,
      estLow: 15000,
      estHigh: 20000,
      reference: '126710BLRO',
      sourceUrl: 'https://www.christies.com/en/lot/lot-123456',
    })

    expect(results[1]).toMatchObject({
      house: 'Phillips',
      lot: 'Rolex GMT-Master II Pepsi',
      result: 17900,
      estLow: 14000,
      estHigh: 19000,
      reference: '126710BLRO',
      sourceUrl: 'https://www.phillips.com/detail/lot-999999',
    })
  })

  it('continues with partial results when one API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('christies.com/api/discoverywebsite/search/lotcards')) {
        return new Response('error', { status: 500 })
      }

      if (url.includes('phillips.com/api/search')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                title: 'Rolex Daytona',
                saleDate: new Date().toISOString(),
                sold_for: '$30,000',
                detailUrl: '/detail/daytona-lot',
                reference: '116500LN',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const results = await fetchRecentAuctionResults({ references: ['116500LN'] })

    expect(results).toHaveLength(1)
    expect(results[0].house).toBe('Phillips')
    expect(results[0].sourceUrl).toBe('https://www.phillips.com/detail/daytona-lot')
  })
})
