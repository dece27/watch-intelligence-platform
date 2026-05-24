import { describe, expect, it } from "vitest"
import {
  DEAL_LISTINGS_CONFIG_ERROR_MESSAGE,
  areDealListingsConfigured,
  fetchDealListings,
} from "@/lib/deal-listings-client"

describe("deal-listings-client config behavior", () => {
  it("exposes Supabase-backed listing config state as boolean", () => {
    expect(typeof areDealListingsConfigured).toBe("boolean")
  })

  it("fails with clear message when Supabase browser env is not configured", async () => {
    if (areDealListingsConfigured) return
    await expect(fetchDealListings({ brands: ["Rolex"], limit: 1 })).rejects.toThrow(
      DEAL_LISTINGS_CONFIG_ERROR_MESSAGE
    )
  })
})
