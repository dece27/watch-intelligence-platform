import { describe, expect, it } from "vitest"
import { convertCurrency, formatCurrency, normalizeCurrency } from "@/lib/currency"

describe("currency helpers", () => {
  it("normalizes unsupported currency to USD", () => {
    expect(normalizeCurrency("abc")).toBe("USD")
  })

  it("converts values between supported currencies", () => {
    const eurAmount = convertCurrency(100, "USD", "EUR")
    expect(eurAmount).toBeCloseTo(92, 5)
  })

  it("returns 0 for non-finite amount", () => {
    expect(convertCurrency(Number.NaN, "USD", "EUR")).toBe(0)
  })

  it("formats with conversion from source currency", () => {
    const formatted = formatCurrency(100, "EUR", { sourceCurrency: "USD" })
    expect(formatted).toContain("€")
  })
})
