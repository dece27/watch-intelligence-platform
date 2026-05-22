import { describe, expect, it } from "vitest"

import {
  buildSharedCollectionUrl,
  getSharedCollectionPrefix,
  getSharedSlugFromLocation,
} from "@/lib/sitePath"

describe("sitePath helpers", () => {
  it("reads shared slugs from the root path", () => {
    expect(getSharedSlugFromLocation("/shared/my-vault")).toBe("my-vault")
  })

  it("reads shared slugs from a GitHub Pages hash route", () => {
    expect(
      getSharedSlugFromLocation("/watch-intelligence-platform/", "#shared/my-vault", "/watch-intelligence-platform/")
    ).toBe("my-vault")
  })

  it("reads legacy shared slugs from a GitHub Pages pathname", () => {
    expect(
      getSharedSlugFromLocation(
        "/watch-intelligence-platform/shared/my-vault",
        "",
        "/watch-intelligence-platform/"
      )
    ).toBe("my-vault")
  })

  it("builds root shared URLs without a hash", () => {
    expect(buildSharedCollectionUrl("https://example.com", "my-vault")).toBe("https://example.com/shared/my-vault")
  })

  it("builds GitHub Pages shared URLs with a hash route", () => {
    expect(
      buildSharedCollectionUrl(
        "https://example.com",
        "my-vault",
        "/watch-intelligence-platform/"
      )
    ).toBe("https://example.com/watch-intelligence-platform/#shared/my-vault")
  })

  it("builds the matching prefix shown in the share modal", () => {
    expect(
      getSharedCollectionPrefix("https://example.com", "/watch-intelligence-platform/")
    ).toBe("https://example.com/watch-intelligence-platform/#shared/")
  })
})
