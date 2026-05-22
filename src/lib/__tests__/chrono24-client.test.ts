import { describe, expect, it } from "vitest"
import {
  CHRONO24_CONFIG_ERROR_MESSAGE,
  hasChrono24Credentials,
  isChrono24WrapperConfigured,
  searchChrono24Deals,
} from "@/lib/chrono24-client"

describe("chrono24-client config behavior", () => {
  it("exposes wrapper config state as boolean", () => {
    expect(typeof isChrono24WrapperConfigured).toBe("boolean")
    expect(hasChrono24Credentials).toBe(true)
  })

  it("fails with clear message when wrapper is not configured", async () => {
    if (isChrono24WrapperConfigured) return
    await expect(searchChrono24Deals({ brand: "Rolex", limit: 1 })).rejects.toThrow(
      CHRONO24_CONFIG_ERROR_MESSAGE
    )
  })
})
