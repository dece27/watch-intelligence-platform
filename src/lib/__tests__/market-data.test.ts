import { afterEach, describe, expect, it, vi } from "vitest"
import { watchChartsClient } from "@/lib/watchcharts-client"
import { enrichDealsWithMarketData, getNormalizedMarketData } from "@/lib/market-data"
import type { Deal } from "@/lib/types"

describe("market-data", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("prefers WatchCharts market data when available", async () => {
    vi.spyOn(watchChartsClient, "getMarketValue").mockResolvedValue(12000)

    const snapshot = await getNormalizedMarketData({
      brand: "Rolex",
      model: "Submariner",
      referenceNumber: "126610LN-test-watchcharts",
      heuristicPrice: 9000,
    })

    expect(snapshot.source).toBe("watchcharts")
    expect(snapshot.latestPrice).toBe(12000)
    expect(snapshot.series12m).toHaveLength(12)
    expect(snapshot.confidence).toBeGreaterThan(0.8)
  })

  it("enriches deals with normalized fair value metadata", async () => {
    vi.spyOn(watchChartsClient, "getMarketValue").mockResolvedValue(10000)

    const inputDeal: Deal = {
      id: "deal-1",
      brand: "Rolex",
      model: "Submariner",
      referenceNumber: "126610LN-test-deal",
      price: 8000,
      currency: "USD",
      discount: 0,
      condition: "Excellent",
      seller: "Seller",
      location: "US",
      matchScore: 60,
    }

    const [deal] = await enrichDealsWithMarketData([inputDeal])
    expect(deal.fairValue).toBe(10000)
    expect(deal.marketValue).toBe(10000)
    expect(deal.discount).toBe(20)
    expect(deal.marketSource).toBe("watchcharts")
    expect(typeof deal.marketUpdatedAt).toBe("string")
  })
})
