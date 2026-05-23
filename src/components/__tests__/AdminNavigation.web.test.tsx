// @vitest-environment jsdom

import { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppSidebar } from "@/components/AppSidebar"
import { MobileNav } from "@/components/MobileNav"

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

async function waitFor(assertion: () => void | Promise<void>, timeoutMs = 3000) {
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

describe("Admin navigation visibility", () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as unknown as { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
    ;(window as Window & { matchMedia?: (query: string) => MediaQueryList }).matchMedia =
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

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

  it("shows admin dashboard and feedback in desktop sidebar only for admin users", async () => {
    await act(async () => {
      root.render(<AppSidebar activeModule="collection" onModuleChange={() => {}} isAdmin />)
    })

    expect(container.textContent).toContain("Admin Dashboard")
    expect(container.textContent).toContain("Feedback")

    await act(async () => {
      root.render(<AppSidebar activeModule="collection" onModuleChange={() => {}} isAdmin={false} />)
    })

    expect(container.textContent).not.toContain("Admin Dashboard")
    expect(container.textContent).not.toContain("Feedback")
  })

  it("shows admin dashboard and feedback in mobile navigation only for admin users", async () => {
    const onModuleChange = vi.fn()

    await act(async () => {
      root.render(<MobileNav activeModule="collection" onModuleChange={onModuleChange} isAdmin />)
    })

    const moreButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("More")
    )
    expect(moreButton).toBeDefined()

    await act(async () => {
      moreButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    await waitFor(() => {
      expect(document.body.textContent).toContain("Admin Dashboard")
      expect(document.body.textContent).toContain("Feedback")
    })

    await act(async () => {
      root.render(<MobileNav activeModule="collection" onModuleChange={onModuleChange} isAdmin={false} />)
    })

    expect(document.body.textContent).not.toContain("Admin Dashboard")
    expect(document.body.textContent).not.toContain("Feedback")
  })
})
