import { describe, expect, it } from "vitest"
import { shouldLoadSparkRuntime } from "@/lib/sparkRuntime"

describe("shouldLoadSparkRuntime", () => {
  it("skips the Spark runtime for standalone pages", () => {
    const self = {}

    expect(
      shouldLoadSparkRuntime({
        self,
        parent: self,
        search: "",
      })
    ).toBe(false)
  })

  it("loads the Spark runtime when embedded by a parent host", () => {
    const self = {}

    expect(
      shouldLoadSparkRuntime({
        self,
        parent: {},
        search: "",
      })
    ).toBe(true)
  })

  it("allows forcing the Spark runtime with a query parameter", () => {
    const self = {}

    expect(
      shouldLoadSparkRuntime({
        self,
        parent: self,
        search: "?spark-runtime=1",
      })
    ).toBe(true)
  })
})
