import { afterEach, describe, expect, it, vi } from "vitest"
import { watchChartsClient } from "@/lib/watchcharts-client"
import {
  __resetMarketDataStateForTests,
  enrichDealsWithMarketData,
  getMarketDashboardData,
  getNormalizedMarketData,
  getPortfolioMarketSnapshots,
} from "@/lib/market-data"
import type { Deal, Watch } from "@/lib/types"

function isGdeltRequest(input: RequestInfo | URL): boolean {
  const urlString = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url
  try {
    const parsed = new URL(urlString)
    return parsed.hostname === "api.gdeltproject.org"
  } catch {
    return false
  }
}

describe("market-data", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    __resetMarketDataStateForTests()
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
    expect(snapshot.latestPrice).toBe(0)
  })

  it("skips malformed dashboard watch inputs without failing the overall market calculation", async () => {
    vi.spyOn(watchChartsClient, "getMarketValue").mockResolvedValue(12000)

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)

    const malformedWatch = {
      id: "watch-malformed",
      brand: undefined,
      model: undefined,
      purchasePrice: 10000,
      purchaseDate: "2024-01-01",
      condition: "excellent",
      category: "sport",
    } as unknown as Watch

    const dashboard = await getMarketDashboardData([
      {
        id: "watch-valid",
        brand: "Rolex",
        model: "Submariner",
        referenceNumber: "126610LN",
        purchasePrice: 11000,
        purchaseDate: "2024-01-01",
        condition: "excellent",
        category: "sport",
      },
      malformedWatch,
    ])

    expect(dashboard.brandIndices.length).toBeGreaterThan(0)
    expect(dashboard.brandIndices.some((index) => index.brand === "Rolex")).toBe(true)
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

  it("coalesces concurrent snapshot requests for the same lookup key", async () => {
    const marketSpy = vi.spyOn(watchChartsClient, "getMarketValue").mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
      return 12345
    })

    const [first, second] = await Promise.all([
      getNormalizedMarketData({
        brand: "Rolex",
        model: "Submariner",
        referenceNumber: "126610LN-coalesce",
      }),
      getNormalizedMarketData({
        brand: "Rolex",
        model: "Submariner",
        referenceNumber: "126610LN-coalesce",
      }),
    ])

    expect(first.latestPrice).toBe(12345)
    expect(second.latestPrice).toBe(12345)
    expect(marketSpy).toHaveBeenCalledTimes(1)
  })

  it("reuses cached sentiment for repeated dashboard calls", async () => {
    vi.spyOn(watchChartsClient, "getMarketValue").mockResolvedValue(12000)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (isGdeltRequest(input)) {
        return {
          ok: true,
          json: async () => ({
            timelines: [{ data: [{ value: 2.1 }, { value: 1.9 }] }],
          }),
        } as Response
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response
    })

    const watches: Watch[] = [{
      id: "watch-1",
      brand: "Rolex",
      model: "Submariner",
      referenceNumber: "126610LN-sentiment-cache",
      purchasePrice: 10000,
      purchaseDate: "2024-01-01",
      condition: "excellent",
      category: "sport",
      hasBox: true,
      hasPapers: true,
    }]

    await getMarketDashboardData(watches)
    const callsAfterFirst = fetchSpy.mock.calls.filter(([input]) => isGdeltRequest(input)).length
    await getMarketDashboardData(watches)
    const callsAfterSecond = fetchSpy.mock.calls.filter(([input]) => isGdeltRequest(input)).length
    expect(callsAfterFirst).toBeGreaterThan(0)
    expect(callsAfterSecond).toBe(callsAfterFirst)
  })

  it("honors Retry-After cooldown for GDELT and avoids immediate retry spam", async () => {
    vi.spyOn(watchChartsClient, "getMarketValue").mockResolvedValue(12000)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (isGdeltRequest(input)) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ "Retry-After": "60" }),
          json: async () => ({}),
        } as Response
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response
    })

    const watches: Watch[] = [{
      id: "watch-1",
      brand: "Patek Philippe",
      model: "Nautilus",
      referenceNumber: "5711-cooldown",
      purchasePrice: 20000,
      purchaseDate: "2024-01-01",
      condition: "excellent",
      category: "dress",
      hasBox: true,
      hasPapers: true,
    }]

    await getMarketDashboardData(watches)
    await getMarketDashboardData(watches)

    const gdeltCalls = fetchSpy.mock.calls.filter(([input]) => isGdeltRequest(input))
    expect(gdeltCalls).toHaveLength(1)
  })

  it("returns dashboard pricing data even when lower-priority sentiment is deferred", async () => {
    vi.spyOn(watchChartsClient, "getMarketValue").mockResolvedValue(10000)
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (isGdeltRequest(input)) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return {
          ok: true,
          json: async () => ({
            timelines: [{ data: [{ value: 1.4 }, { value: 1.2 }] }],
          }),
        } as Response
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response
    })

    const watches: Watch[] = [
      {
        id: "watch-1",
        brand: "Rolex",
        model: "Submariner",
        referenceNumber: "126610LN-defer-1",
        purchasePrice: 10000,
        purchaseDate: "2024-01-01",
        condition: "excellent",
        category: "sport",
        hasBox: true,
        hasPapers: true,
      },
      {
        id: "watch-2",
        brand: "Patek Philippe",
        model: "Nautilus",
        referenceNumber: "5711-defer-2",
        purchasePrice: 20000,
        purchaseDate: "2024-01-01",
        condition: "excellent",
        category: "dress",
        hasBox: true,
        hasPapers: true,
      },
      {
        id: "watch-3",
        brand: "Audemars Piguet",
        model: "Royal Oak",
        referenceNumber: "15510ST-defer-3",
        purchasePrice: 21000,
        purchaseDate: "2024-01-01",
        condition: "excellent",
        category: "sport",
        hasBox: true,
        hasPapers: true,
      },
      {
        id: "watch-4",
        brand: "Omega",
        model: "Speedmaster",
        referenceNumber: "310-defer-4",
        purchasePrice: 9000,
        purchaseDate: "2024-01-01",
        condition: "good",
        category: "sport",
        hasBox: false,
        hasPapers: true,
      },
    ]

    const dashboard = await getMarketDashboardData(watches)
    expect(dashboard.brandIndices.length).toBeGreaterThan(0)
    expect(dashboard.topMovers.length).toBeGreaterThan(0)
  })
})
