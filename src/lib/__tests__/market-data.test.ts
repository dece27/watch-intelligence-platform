import { afterEach, describe, expect, it, vi } from "vitest"
import { watchChartsClient } from "@/lib/watchcharts-client"
import { enrichDealsWithMarketData, getMarketDashboardData, getNormalizedMarketData, getPortfolioMarketSnapshots } from "@/lib/market-data"
import type { Deal, Watch } from "@/lib/types"

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

  it("does not mask missing market data with purchase price in portfolio snapshots", async () => {
    vi.spyOn(watchChartsClient, "getMarketValue").mockResolvedValue(null)
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)

    const [snapshot] = Object.values(await getPortfolioMarketSnapshots([{
      id: "watch-1",
      brand: "Rolex",
      model: "Submariner",
      referenceNumber: "126610LN-missing-market",
      purchasePrice: 15000,
      purchaseDate: "2024-01-01",
      condition: "excellent",
      category: "sport",
      hasBox: true,
      hasPapers: true,
    }]))

    expect(snapshot.source).toBe("heuristic")
    expect(snapshot.latestPrice).toBe(100)
  })

  it("normalizes malformed lookup inputs so missing brand/model do not crash", async () => {
    vi.spyOn(watchChartsClient, "getMarketValue").mockResolvedValue(null)
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)

    const snapshot = await getNormalizedMarketData({
      brand: "",
      model: "",
      referenceNumber: "MALFORMED-REF",
      heuristicPrice: 1500,
    })

    expect(snapshot.brand).toBe("Unknown")
    expect(snapshot.model).toBe("MALFORMED-REF")
    expect(snapshot.latestPrice).toBe(1500)
  })

  it("keeps top movers available with malformed watches and provider failures", async () => {
    vi.spyOn(watchChartsClient, "getMarketValue").mockImplementation(async ({ referenceNumber }) => {
      if (referenceNumber === "126610LN") {
        throw new Error("provider unavailable")
      }
      return null
    })
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)

    const malformedWatch = {
      id: "watch-malformed",
      brand: "",
      model: "",
      purchasePrice: 5000,
      purchaseDate: "2024-01-01",
      condition: "good",
      category: "sport",
      hasBox: false,
      hasPapers: false,
    } as Watch

    const dashboard = await getMarketDashboardData([malformedWatch])
    expect(dashboard.topMovers.length).toBeGreaterThan(0)
    expect(dashboard.brandIndices.length).toBeGreaterThan(0)
  })
})
