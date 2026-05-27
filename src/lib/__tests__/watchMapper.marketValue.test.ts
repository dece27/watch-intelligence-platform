import { describe, expect, it } from "vitest"
import { rowToWatch, watchToInsert, watchToUpdate } from "@/lib/db/watchMapper"
import type { Watch } from "@/lib/types"
import type { WatchRow } from "@/lib/db/watches"

describe("watchMapper market valuation fields", () => {
  const watch: Watch = {
    id: "2b1530fc-f976-4f5c-a52e-e5f434f827ec",
    brand: "Rolex",
    model: "Submariner",
    referenceNumber: "126610LN",
    purchasePrice: 10500,
    purchaseDate: "2025-01-01",
    currentValue: 12250,
    marketSource: "watchcharts",
    marketConfidence: 0.95,
    marketUpdatedAt: "2026-05-27T00:00:00.000Z",
    condition: "excellent",
    category: "sport",
    hasBox: true,
    hasPapers: true,
  }

  it("maps app watch market valuation fields into insert/update payloads", () => {
    const insert = watchToInsert(watch, "8bc7353e-f60a-4ec3-aa4f-1df9e7f52f14")
    const update = watchToUpdate(watch)

    expect(insert.market_value).toBe(12250)
    expect(insert.market_source).toBe("watchcharts")
    expect(insert.market_confidence).toBe(0.95)
    expect(insert.market_updated_at).toBe("2026-05-27T00:00:00.000Z")

    expect(update.market_value).toBe(12250)
    expect(update.market_source).toBe("watchcharts")
    expect(update.market_confidence).toBe(0.95)
    expect(update.market_updated_at).toBe("2026-05-27T00:00:00.000Z")
  })

  it("maps row market valuation fields back to app watch", () => {
    const row: WatchRow = {
      id: "2b1530fc-f976-4f5c-a52e-e5f434f827ec",
      user_id: "8bc7353e-f60a-4ec3-aa4f-1df9e7f52f14",
      brand: "Rolex",
      model: "Submariner",
      reference: "126610LN",
      year: 2024,
      condition: "Excellent",
      has_box: true,
      has_papers: true,
      purchase_price: 10500,
      purchase_date: "2025-01-01",
      purchase_currency: "USD",
      market_value: 12250,
      market_source: "watchcharts",
      market_confidence: 0.95,
      market_updated_at: "2026-05-27T00:00:00.000Z",
      serial_number: null,
      notes: null,
      cover_photo_url: null,
      is_sold: false,
      sold_price: null,
      sold_date: null,
      deleted_at: null,
      created_at: "2026-05-27T00:00:00.000Z",
      updated_at: "2026-05-27T00:00:00.000Z",
      category: "sport",
      movement: null,
      case_material: null,
      case_diameter: null,
    }

    const mapped = rowToWatch(row)
    expect(mapped.currentValue).toBe(12250)
    expect(mapped.marketSource).toBe("watchcharts")
    expect(mapped.marketConfidence).toBe(0.95)
    expect(mapped.marketUpdatedAt).toBe("2026-05-27T00:00:00.000Z")
  })
})
