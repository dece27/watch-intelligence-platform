// @vitest-environment jsdom

import { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppraisalModule } from "@/components/modules/AppraisalModule"
import type { Watch } from "@/lib/types"
import type { ReactNode } from "react"

const getMarketValue = vi.fn(async () => 99999)
const getNormalizedMarketData = vi.fn(async () => ({
  brand: "Rolex",
  model: "Submariner",
  referenceNumber: "126610LN",
  latestPrice: 88888,
  currency: "USD",
  source: "watchcharts" as const,
  updatedAt: new Date().toISOString(),
  confidence: 0.95,
  series12m: [],
}))

vi.mock("@/lib/watchcharts-client", () => ({
  watchChartsClient: {
    getMarketValue,
  },
}))

vi.mock("@/lib/market-data", () => ({
  getNormalizedMarketData,
  marketConfidenceLabel: () => "high",
}))

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@phosphor-icons/react", () => ({
  Printer: () => null,
}))

describe("AppraisalModule", () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.print = vi.fn()
    getMarketValue.mockClear()
    getNormalizedMarketData.mockClear()

    container = document.createElement("div")
    document.body.innerHTML = ""
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
  })

  it("uses the stored collection current value instead of overriding it with live market data", async () => {
    const watches: Watch[] = [
      {
        id: "watch-1",
        brand: "Rolex",
        model: "Submariner",
        referenceNumber: "126610LN",
        purchasePrice: 11000,
        purchaseDate: "2024-01-01",
        currentValue: 12345,
        condition: "excellent",
        category: "sport",
      },
    ]

    await act(async () => {
      root.render(<AppraisalModule watches={watches} preferredCurrency="USD" />)
    })

    expect(container.textContent).toContain("$12,345")
    expect(container.textContent).not.toContain("$99,999")
    expect(container.textContent).not.toContain("$88,888")
    expect(getMarketValue).not.toHaveBeenCalled()
    expect(getNormalizedMarketData).not.toHaveBeenCalled()
  })
})
