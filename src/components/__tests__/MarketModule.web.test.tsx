// @vitest-environment jsdom

import { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MarketModule } from "@/components/modules/MarketModule"
import * as marketData from "@/lib/market-data"
import type { Watch } from "@/lib/types"
import type { ReactNode } from "react"

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  CartesianGrid: () => <div />,
}))

vi.mock("@/lib/useKV", () => ({
  useKV: () => [[], vi.fn()],
}))

vi.mock("@/lib/auction-feeds", () => ({
  fetchRecentAuctionResults: vi.fn(async () => []),
}))

vi.mock("@/lib/market-data", async () => {
  const actual = await vi.importActual<typeof import("@/lib/market-data")>("@/lib/market-data")
  return {
    ...actual,
    evaluatePriceAlerts: vi.fn(async () => ({})),
    getMarketDashboardData: vi.fn(async () => ({ brandIndices: [], topMovers: [], updatedAt: new Date().toISOString() })),
    getReferenceMarketData: vi.fn(async () => null),
  }
})

async function waitFor(assertion: () => void | Promise<void>, timeoutMs = 5000) {
  const startedAt = Date.now()
  let lastError: unknown

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await act(async () => {
        await Promise.resolve()
      })
      await assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
    }
  }

  throw lastError
}

describe("MarketModule overall market state", () => {
  let root: Root
  let container: HTMLDivElement

  const watches: Watch[] = [{
    id: "watch-1",
    brand: "Rolex",
    model: "Submariner",
    purchasePrice: 12000,
    purchaseDate: "2024-01-01",
    condition: "excellent",
    category: "sport",
  }]

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.innerHTML = ""
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    vi.restoreAllMocks()
  })

  it("shows explicit unavailable message instead of 100 placeholder on dashboard errors", async () => {
    vi.spyOn(marketData, "getMarketDashboardData").mockRejectedValueOnce(new Error("market failed"))

    await act(async () => {
      root.render(<MarketModule watches={watches} preferredCurrency="USD" />)
    })

    await waitFor(() => {
      expect(container.textContent).toContain("Overall Market")
      expect(container.textContent).toContain("Market data unavailable")
      expect(container.textContent).not.toContain("100.0")
    })
  })

  it("shows explicit empty-state message instead of 100 placeholder when no indices are available", async () => {
    vi.spyOn(marketData, "getMarketDashboardData").mockResolvedValueOnce({
      brandIndices: [],
      topMovers: [],
      updatedAt: new Date().toISOString(),
    })

    await act(async () => {
      root.render(<MarketModule watches={watches} preferredCurrency="USD" />)
    })

    await waitFor(() => {
      expect(container.textContent).toContain("Overall Market")
      expect(container.textContent).toContain("No market index data available")
      expect(container.textContent).not.toContain("100.0")
    })
  })
})
