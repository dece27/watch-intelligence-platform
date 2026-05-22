import { describe, expect, it } from "vitest"
import { hashPassword, verifyPassword } from "@/lib/auth"

describe("auth hashing", () => {
  it("hashes and verifies a valid password", async () => {
    const payload = await hashPassword("strong-password")
    await expect(verifyPassword("strong-password", payload)).resolves.toBe(true)
  })

  it("rejects an invalid password", async () => {
    const payload = await hashPassword("strong-password")
    await expect(verifyPassword("wrong-password", payload)).resolves.toBe(false)
  })
})
