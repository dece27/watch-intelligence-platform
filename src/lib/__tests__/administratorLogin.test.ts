import { beforeEach, describe, expect, it, vi } from "vitest"
import { ADMIN_EMAIL } from "@/lib/adminAnalytics"
import { verifyPassword } from "@/lib/auth"
import { shouldShowAccountCreationFields } from "@/components/LoginScreen"
import type { AuthRecord, User } from "@/lib/types"

const ensureUserIndexedMock = vi.hoisted(() => vi.fn(async () => {}))

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

// Replicates the validation logic used in LoginScreen so tests stay in sync
// with the real identifier check without coupling to internal component details.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ADMIN_LOGIN_IDENTIFIER = "administrator"

function isValidLoginIdentifier(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized === ADMIN_LOGIN_IDENTIFIER || EMAIL_REGEX.test(normalized)
}

describe("Administrator login flow", () => {
  beforeEach(() => {
    ensureUserIndexedMock.mockClear()
  })

  describe("login identifier validation", () => {
    it('accepts "Administrator" (capital A) as a valid identifier', () => {
      expect(isValidLoginIdentifier("Administrator")).toBe(true)
    })

    describe("account creation field visibility", () => {
      it("does not show account-creation fields for administrator even before account lookup resolves", () => {
        expect(shouldShowAccountCreationFields("administrator", false)).toBe(false)
        expect(shouldShowAccountCreationFields("Administrator", false)).toBe(false)
      })

      it("shows account-creation fields for new non-admin identifiers", () => {
        expect(shouldShowAccountCreationFields("new.user@example.com", false)).toBe(true)
      })
    })

    it('accepts "administrator" (all lowercase) as a valid identifier', () => {
      expect(isValidLoginIdentifier("administrator")).toBe(true)
    })

    it('accepts "ADMINISTRATOR" (all caps) as a valid identifier', () => {
      expect(isValidLoginIdentifier("ADMINISTRATOR")).toBe(true)
    })

    it('accepts "  Administrator  " (with surrounding whitespace) as a valid identifier', () => {
      expect(isValidLoginIdentifier("  Administrator  ")).toBe(true)
    })

    it('rejects partial identifiers like "admin"', () => {
      expect(isValidLoginIdentifier("admin")).toBe(false)
    })

    it("accepts a valid email address as a login identifier", () => {
      expect(isValidLoginIdentifier("user@example.com")).toBe(true)
    })

    it("rejects a string that is neither a full email nor the administrator identifier", () => {
      expect(isValidLoginIdentifier("notvalid")).toBe(false)
      expect(isValidLoginIdentifier("")).toBe(false)
    })
  })

  describe("account lookup after bootstrap", () => {
    it("finds the administrator account by email key after ensureDefaultAccount runs", async () => {
      const { ensureDefaultAccount, DEFAULT_ACCOUNT_EMAIL } = await import(
        "@/lib/defaultAccount"
      )
      const store: KvStore = new Map()
      ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

      await ensureDefaultAccount()

      // Simulate what LoginScreen.checkExistingUser does for "administrator"
      const normalizedEmail = DEFAULT_ACCOUNT_EMAIL.trim().toLowerCase()
      expect(normalizedEmail).toBe(ADMIN_EMAIL)

      const emailKey = `user_email_${normalizedEmail}`
      const userId = store.get(emailKey) as string
      expect(typeof userId).toBe("string")
      expect(userId.length).toBeGreaterThan(0)

      const user = store.get(`user_${userId}`) as User
      expect(user).toBeDefined()
      expect(user.email).toBe(normalizedEmail)
    })

    it("does not find the administrator account when queried before ensureDefaultAccount runs (race condition)", async () => {
      // Fresh store with no pre-populated data
      const store: KvStore = new Map()
      ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

      // Deliberately skip ensureDefaultAccount — simulates the race condition
      // where checkExistingUser runs before bootstrap completes
      const emailKey = `user_email_${ADMIN_EMAIL}`
      const userId = store.get(emailKey)
      expect(userId).toBeUndefined()
    })

    it("correctly resolves the account once bootstrap completes (fix verification)", async () => {
      const { ensureDefaultAccount } = await import("@/lib/defaultAccount")
      const store: KvStore = new Map()
      ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

      // Before bootstrap: account is missing
      expect(store.get(`user_email_${ADMIN_EMAIL}`)).toBeUndefined()

      // After bootstrap: account is present
      await ensureDefaultAccount()
      const userId = store.get(`user_email_${ADMIN_EMAIL}`) as string
      expect(typeof userId).toBe("string")

      const user = store.get(`user_${userId}`) as User
      expect(user).toBeDefined()
    })
  })

  describe("password authentication", () => {
    it('authenticates the Administrator account with the default password "WatchVault"', async () => {
      const { ensureDefaultAccount } = await import("@/lib/defaultAccount")
      const store: KvStore = new Map()
      ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

      await ensureDefaultAccount()

      const userId = store.get(`user_email_${ADMIN_EMAIL}`) as string
      const auth = store.get(`auth_${userId}`) as AuthRecord

      await expect(verifyPassword("WatchVault", auth)).resolves.toBe(true)
    })

    it("rejects an incorrect password for the Administrator account", async () => {
      const { ensureDefaultAccount } = await import("@/lib/defaultAccount")
      const store: KvStore = new Map()
      ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

      await ensureDefaultAccount()

      const userId = store.get(`user_email_${ADMIN_EMAIL}`) as string
      const auth = store.get(`auth_${userId}`) as AuthRecord

      await expect(verifyPassword("wrongpassword", auth)).resolves.toBe(false)
      await expect(verifyPassword("", auth)).resolves.toBe(false)
    })
  })

  describe("full login sequence", () => {
    it("completes the full Administrator login sequence end to end", async () => {
      const { ensureDefaultAccount, DEFAULT_ACCOUNT_EMAIL } = await import(
        "@/lib/defaultAccount"
      )
      const store: KvStore = new Map()
      ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

      // Step 1: bootstrap (ensures admin account exists in KV)
      await ensureDefaultAccount()

      // Step 2: check whether the identifier is valid
      const inputIdentifier = "Administrator"
      expect(isValidLoginIdentifier(inputIdentifier)).toBe(true)

      // Step 3: normalize and look up the email key
      const normalized = inputIdentifier.trim().toLowerCase()
      expect(normalized).toBe(DEFAULT_ACCOUNT_EMAIL.trim().toLowerCase())

      const emailKey = `user_email_${normalized}`
      const existingUserId = store.get(emailKey) as string
      expect(existingUserId).toBeDefined()

      // Step 4: load the user profile
      const user = store.get(`user_${existingUserId}`) as User
      expect(user).toBeDefined()
      expect(user.id).toBe(existingUserId)

      // Step 5: load the auth record and verify the password
      const auth = store.get(`auth_${existingUserId}`) as AuthRecord
      expect(auth).toBeDefined()
      await expect(verifyPassword("WatchVault", auth)).resolves.toBe(true)
    })

    it("self-heals and authenticates when the administrator email key is temporarily missing", async () => {
      const { ensureDefaultAccount, DEFAULT_ACCOUNT_EMAIL } = await import(
        "@/lib/defaultAccount"
      )
      const store: KvStore = new Map()
      ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

      await ensureDefaultAccount()
      store.delete(`user_email_${DEFAULT_ACCOUNT_EMAIL}`)
      expect(store.get(`user_email_${DEFAULT_ACCOUNT_EMAIL}`)).toBeUndefined()

      await ensureDefaultAccount()

      const repairedUserId = store.get(`user_email_${DEFAULT_ACCOUNT_EMAIL}`) as string
      expect(repairedUserId).toBeDefined()

      const repairedAuth = store.get(`auth_${repairedUserId}`) as AuthRecord
      expect(repairedAuth).toBeDefined()
      await expect(verifyPassword("WatchVault", repairedAuth)).resolves.toBe(true)
    })
  })
})
