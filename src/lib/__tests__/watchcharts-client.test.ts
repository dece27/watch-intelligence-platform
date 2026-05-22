import { afterEach, describe, expect, it, vi } from "vitest"
import { WatchChartsClient } from "@/lib/watchcharts-client"

describe("WatchChartsClient", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("searchWatches sends query params and API key header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], total: 0, page: 1, limit: 1 }),
    } as Response)

    const client = new WatchChartsClient({
      baseURL: "https://example.test",
      apiKey: "token-123",
      apiKeyHeader: "X-API-Key",
      timeoutMs: 5000,
    })

    await client.searchWatches({ query: "Rolex", brand: "Rolex", limit: 1 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("/watches/search")
    expect(String(url)).toContain("query=Rolex")
    expect((init as RequestInit)?.headers).toMatchObject({
      Accept: "application/json",
      "X-API-Key": "token-123",
    })
  })

  it("getMarketValue returns null when no matches are found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], total: 0, page: 1, limit: 1 }),
    } as Response)

    const client = new WatchChartsClient({ baseURL: "https://example.test" })
    await expect(
      client.getMarketValue({ brand: "Rolex", model: "Submariner", referenceNumber: "126610LN" })
    ).resolves.toBeNull()
  })
})
