import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AuthRecord, User } from "@/lib/types"
import { verifyPassword } from "@/lib/auth"

const PROTECTED_ADMIN_USER_ID_KEY = "protected_admin_user_id"

const ensureUserIndexedMock = vi.fn(async () => {})

vi.mock("@/lib/adminAnalytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/adminAnalytics")>()
  return {
    ...actual,
    ensureUserIndexed: ensureUserIndexedMock,
  }
})

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
    await expect(verifyPassword("WatchVault", auth)).resolves.toBe(true)
    expect(store.get(PROTECTED_ADMIN_USER_ID_KEY)).toBe(userId)
    expect(ensureUserIndexedMock).toHaveBeenCalledWith(userId)
  })

  it("skips re-hashing when a valid complete auth record already exists", async () => {
    const { ensureDefaultAccount, DEFAULT_ACCOUNT_EMAIL } = await import("@/lib/defaultAccount")
    const store: KvStore = new Map()
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

    // First call creates the account and hashes the password.
    await ensureDefaultAccount()

    const emailKey = `user_email_${DEFAULT_ACCOUNT_EMAIL.toLowerCase()}`
    const userId = store.get(emailKey) as string
    const authAfterFirstCall = store.get(`auth_${userId}`) as AuthRecord
    expect(authAfterFirstCall.salt).toBeDefined()

    // Mutate the auth record so we can detect whether it was overwritten.
    const sentinel = "sentinel-value"
    store.set(`auth_${userId}`, { ...authAfterFirstCall, lastLoginAt: sentinel })

    // Second call should take the early-exit path and NOT overwrite the auth.
    await ensureDefaultAccount()

    const authAfterSecondCall = store.get(`auth_${userId}`) as AuthRecord
    expect(authAfterSecondCall.lastLoginAt).toBe(sentinel)
  })

  it("re-initialises the auth record when it exists but is missing required fields", async () => {
    const { ensureDefaultAccount, DEFAULT_ACCOUNT_EMAIL } = await import("@/lib/defaultAccount")
    const userId = "existing-admin-id"
    const normalizedEmail = DEFAULT_ACCOUNT_EMAIL.toLowerCase()
    const store: KvStore = new Map([
      [`user_email_${normalizedEmail}`, userId],
      [
        `user_${userId}`,
        {
          id: userId,
          name: "Administrator",
          email: normalizedEmail,
          vaultName: "WatchVault",
          createdAt: "2025-01-01T00:00:00.000Z",
        } satisfies User,
      ],
      // Malformed auth record: exists (truthy) but missing salt, passwordHash, and iterations
      [`auth_${userId}`, { userId } satisfies Partial<AuthRecord>],
    ])
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

    await ensureDefaultAccount()

    const auth = store.get(`auth_${userId}`) as AuthRecord
    // Auth should have been repaired with the correct password
    expect(auth.passwordHash).toBeDefined()
    expect(auth.salt).toBeDefined()
    expect(auth.iterations).toBeGreaterThan(0)
    await expect(verifyPassword("WatchVault", auth)).resolves.toBe(true)
  })

  it("deletes legacy admin users during bootstrap", async () => {
    const { ensureDefaultAccount, DEFAULT_ACCOUNT_EMAIL } = await import("@/lib/defaultAccount")
    const legacyUserId = "legacy-admin-id"
    const legacyUserEmail = "dec.davide@gmail.com"
    const store: KvStore = new Map([
      ["all_user_ids", [legacyUserId]],
      [
        `user_${legacyUserId}`,
        {
          id: legacyUserId,
          name: "Legacy Admin",
          email: legacyUserEmail,
          vaultName: "Legacy Vault",
          createdAt: "2025-01-01T00:00:00.000Z",
        } satisfies User,
      ],
      [`user_email_${legacyUserEmail}`, legacyUserId],
      [`auth_${legacyUserId}`, { userId: legacyUserId } satisfies Partial<AuthRecord>],
      [`watches_${legacyUserId}`, []],
      [`ai_usage_${legacyUserId}`, { userId: legacyUserId, aiTokensUsed: 0, aiRequestsCount: 0 }],
      [`vaultMetadata_${legacyUserId}`, { userId: legacyUserId }],
    ])
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

    await ensureDefaultAccount()

    const adminUserId = store.get(`user_email_${DEFAULT_ACCOUNT_EMAIL.toLowerCase()}`) as string
    expect(adminUserId).toEqual(expect.any(String))
    expect(store.has(`user_${legacyUserId}`)).toBe(false)
    expect(store.has(`auth_${legacyUserId}`)).toBe(false)
    expect(store.has(`watches_${legacyUserId}`)).toBe(false)
    expect(store.has(`ai_usage_${legacyUserId}`)).toBe(false)
    expect(store.has(`vaultMetadata_${legacyUserId}`)).toBe(false)
    expect(store.has(`user_email_${legacyUserEmail}`)).toBe(false)
  })
})
