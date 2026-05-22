import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AuthRecord, User } from "@/lib/types"

const ensureUserIndexedMock = vi.fn(async () => {})

vi.mock("@/lib/adminAnalytics", () => ({
  ensureUserIndexed: ensureUserIndexedMock,
}))

type KvStore = Map<string, unknown>

function createSparkWindow(store: KvStore) {
  return {
    spark: {
      kv: {
        get: async <T,>(key: string) => store.get(key) as T | undefined,
        set: async <T,>(key: string, value: T) => {
          store.set(key, value)
        },
        delete: async (key: string) => {
          store.delete(key)
        },
        keys: async () => Array.from(store.keys()),
      },
    },
  }
}

describe("ensureDefaultAccount", () => {
  beforeEach(() => {
    ensureUserIndexedMock.mockClear()
  })

  it("creates missing default account and auth records", async () => {
    const { ensureDefaultAccount, DEFAULT_ACCOUNT_EMAIL } = await import("@/lib/defaultAccount")
    const store: KvStore = new Map()
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

    await ensureDefaultAccount()

    const emailKey = `user_email_${DEFAULT_ACCOUNT_EMAIL.toLowerCase()}`
    const userId = store.get(emailKey) as string
    expect(typeof userId).toBe("string")
    expect(userId.length).toBeGreaterThan(0)

    const user = store.get(`user_${userId}`) as User
    expect(user.email).toBe(DEFAULT_ACCOUNT_EMAIL.toLowerCase())

    const auth = store.get(`auth_${userId}`) as AuthRecord
    expect(auth.userId).toBe(userId)
    expect(auth.failedAttempts).toBe(0)
    expect(ensureUserIndexedMock).toHaveBeenCalledWith(userId)
  })
})
