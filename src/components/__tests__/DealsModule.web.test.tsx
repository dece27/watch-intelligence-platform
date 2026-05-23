// @vitest-environment jsdom

import { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DealsModule } from "@/components/modules/DealsModule"
import type { DealsPreferences, UserPreferences, Watch } from "@/lib/types"
import type { ReactNode } from "react"

vi.mock("@/lib/chrono24-client", () => ({
  searchChrono24Deals: vi.fn(async () => []),
  clearChrono24SearchCache: vi.fn(),
  isChrono24WrapperConfigured: false,
}))

vi.mock("@/lib/adminAnalytics", () => ({
  callTrackedLlm: vi.fn(async () => `VERDICT: GOOD DEAL\nREASONING: This listing is competitively priced.\nRISK: Verify service history.`),
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

describe("DealsModule browser regression", () => {
  let root: Root
  let container: HTMLDivElement
  let kvStore: Map<string, unknown>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as unknown as { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock

    kvStore = new Map<string, unknown>()

    const storedPreferences: DealsPreferences = {
      preferredBrands: ["Rolex", "Omega"],
      selectedBrand: "all",
      condition: "all",
      maxPrice: 25000,
      minDiscount: 5,
      minSellerRating: 4,
      requireBox: false,
      requirePapers: false,
      aiOnlyTop: false,
      sortBy: "ai-match",
    }

    kvStore.set("user_preferences_user-1", {
      userId: "user-1",
      deals: storedPreferences,
      updatedAt: new Date().toISOString(),
    } satisfies UserPreferences)

    window.spark = {
      kv: {
        get: async <T,>(key: string) => (kvStore.has(key) ? (kvStore.get(key) as T) : undefined),
        set: vi.fn(async (key: string, value: unknown) => {
          kvStore.set(key, value)
        }),
        delete: vi.fn(async (key: string) => {
          kvStore.delete(key)
        }),
        keys: vi.fn(async () => Array.from(kvStore.keys())),
      },
      llm: vi.fn(async () => ""),
      llmPrompt: (strings: string[], ...values: unknown[]) =>
        strings.reduce((result, segment, index) => result + segment + String(values[index] ?? ""), ""),
      user: vi.fn(async () => ({
        avatarUrl: "",
        email: "administrator",
        id: 1,
        isOwner: true,
        login: "administrator",
      })),
    }

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    container = document.createElement("div")
    document.body.innerHTML = ""
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    consoleErrorSpy.mockRestore()
  })

  it("opens deal details from Deal Flow without React runtime errors", async () => {
    const watches: Watch[] = [
      {
        id: "watch-1",
        brand: "Rolex",
        model: "Submariner",
        purchasePrice: 12000,
        purchaseDate: "2024-01-01",
        condition: "excellent",
        category: "sport",
      },
    ]

    await act(async () => {
      root.render(<DealsModule watches={watches} userId="user-1" preferredCurrency="USD" />)
    })

    await waitFor(() => {
      expect(container.textContent).toContain("View Details")
    })

    const viewDetailsButton = Array.from(container.querySelectorAll("button")).find((button) =>
      (button.textContent || "").includes("View Details")
    )

    expect(viewDetailsButton).toBeTruthy()

    await act(async () => {
      viewDetailsButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain("AI Dealer Analysis")
    })

    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})
