// @vitest-environment jsdom

import React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import App from "@/App"
import type { User, UserPreferences, Watch } from "@/lib/types"

const cacheUser: User = {
  id: "cache-user-1",
  name: "Collector One",
  email: "collector@example.com",
  vaultName: "Collector Vault",
  createdAt: "2024-01-01T00:00:00.000Z",
}

const supabaseUserId = "supabase-user-1"
const existingWatchId = "d4e3b2a1-0000-4000-8000-000000000001"
const addedWatchId = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

const mockState = vi.hoisted(() => ({
  kvStore: new Map(),
  supabaseWatches: new Map(),
  supabasePreferences: new Map(),
  authCallbacks: new Set(),
  currentSessionUserId: null as string | null,
  emitSessionOnLogin: true,
  getUserPreferencesMock: vi.fn(),
  upsertUserPreferencesMock: vi.fn(),
  upsertUserProfileMock: vi.fn(),
  getWatchesMock: vi.fn(),
  createWatchMock: vi.fn(),
  updateWatchMock: vi.fn(),
  softDeleteWatchMock: vi.fn(),
  signOutMock: vi.fn(),
}))

type AuthStateChangeCallback = (event: string, session: { user: { id: string } } | null) => void
type SupabaseWatchRow = {
  id: string
  user_id: string
  brand: string
  model: string | null
  reference: string
  year: number | null
  condition: "Excellent" | "Good" | "Fair" | "Mint" | "Unworn" | "Very Good" | null
  has_box: boolean
  has_papers: boolean
  purchase_price: number | null
  purchase_date: string | null
  serial_number: string | null
  notes: string | null
  cover_photo_url: string | null
  category: string | null
  movement: string | null
  case_material: string | null
  case_diameter: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function emitAuthStateChange(userId: string | null) {
  mockState.currentSessionUserId = userId
  const session = userId ? { user: { id: userId } } : null
  for (const callback of mockState.authCallbacks as Set<AuthStateChangeCallback>) {
    callback(userId ? "SIGNED_IN" : "SIGNED_OUT", session)
  }
}

function createSupabaseWatchRow(overrides: Partial<SupabaseWatchRow>): SupabaseWatchRow {
  const id = overrides.id ?? crypto.randomUUID()
  const timestamp = overrides.updated_at ?? new Date().toISOString()
  return {
    id,
    user_id: overrides.user_id ?? supabaseUserId,
    brand: overrides.brand ?? "Omega",
    model: overrides.model ?? "Speedmaster",
    reference: overrides.reference ?? `REF-${id}`,
    year: overrides.year ?? 2024,
    condition: overrides.condition ?? "Excellent",
    has_box: overrides.has_box ?? true,
    has_papers: overrides.has_papers ?? true,
    purchase_price: overrides.purchase_price ?? 7500,
    purchase_date: overrides.purchase_date ?? "2024-01-01",
    serial_number: overrides.serial_number ?? null,
    notes: overrides.notes ?? null,
    cover_photo_url: overrides.cover_photo_url ?? null,
    category: overrides.category ?? "chronograph",
    movement: overrides.movement ?? "Manual",
    case_material: overrides.case_material ?? "Steel",
    case_diameter: overrides.case_diameter ?? "42mm",
    created_at: overrides.created_at ?? timestamp,
    updated_at: timestamp,
    deleted_at: overrides.deleted_at ?? null,
  }
}

async function waitFor(assertion: () => void | Promise<void>, timeoutMs = 5000) {
  const startedAt = Date.now()
  let lastError: unknown

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await act(async () => {
        await Promise.resolve()
      })
      await assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
    }
  }

  throw lastError
}

async function click(testId: string) {
  const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
  if (!element) {
    throw new Error(`Missing element with test id ${testId}`)
  }
  await act(async () => {
    element.click()
  })
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  })
}

const getUserPreferencesMock = mockState.getUserPreferencesMock.mockImplementation(async (_client: unknown, userId: string) => {
  return mockState.supabasePreferences.get(userId) ?? null
})

const upsertUserPreferencesMock = mockState.upsertUserPreferencesMock.mockImplementation(async (_client: unknown, preferences: any) => {
  const nextPreferences = {
    userId: preferences.userId,
    currency: preferences.currency,
    locale: preferences.locale,
    theme: preferences.theme,
    showPurchasePrices: preferences.showPurchasePrices,
    emailPriceAlerts: preferences.emailPriceAlerts,
    emailWeeklyDigest: preferences.emailWeeklyDigest,
    defaultPortfolioView: preferences.defaultPortfolioView,
    updatedAt: new Date().toISOString(),
  }
  mockState.supabasePreferences.set(preferences.userId, nextPreferences)
  return nextPreferences
})

const upsertUserProfileMock = mockState.upsertUserProfileMock.mockImplementation(async (_client: unknown, profile: any) => ({
  id: profile.id,
  displayName: profile.displayName,
  isPublic: profile.isPublic,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}))

const getWatchesMock = mockState.getWatchesMock.mockImplementation(async (userId: string) => {
  return Array.from(mockState.supabaseWatches.values() as Iterable<SupabaseWatchRow>)
    .filter((watch) => watch.user_id === userId && watch.deleted_at === null)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
})

const createWatchMock = mockState.createWatchMock.mockImplementation(async (watchInsert: any) => {
  const row = createSupabaseWatchRow({
    id: watchInsert.id,
    user_id: watchInsert.user_id,
    brand: watchInsert.brand,
    model: watchInsert.model,
    reference: watchInsert.reference,
    year: watchInsert.year,
    condition: watchInsert.condition,
    has_box: watchInsert.has_box,
    has_papers: watchInsert.has_papers,
    purchase_price: watchInsert.purchase_price,
    purchase_date: watchInsert.purchase_date,
    serial_number: watchInsert.serial_number,
    notes: watchInsert.notes,
    cover_photo_url: watchInsert.cover_photo_url,
    category: watchInsert.category,
    movement: watchInsert.movement,
    case_material: watchInsert.case_material,
    case_diameter: watchInsert.case_diameter,
  })
  mockState.supabaseWatches.set(row.id, row)
  return row
})

const updateWatchMock = mockState.updateWatchMock.mockImplementation(async (id: string, watchUpdate: any) => {
  const current = mockState.supabaseWatches.get(id) as SupabaseWatchRow | undefined
  if (!current) {
    throw new Error(`Watch ${id} not found`)
  }

  const next = createSupabaseWatchRow({
    ...current,
    ...watchUpdate,
    id,
    user_id: current.user_id,
    created_at: current.created_at,
  })
  mockState.supabaseWatches.set(id, next)
  return next
})

const softDeleteWatchMock = mockState.softDeleteWatchMock.mockImplementation(async (id: string) => {
  const current = mockState.supabaseWatches.get(id) as SupabaseWatchRow | undefined
  if (!current) return
  mockState.supabaseWatches.set(id, {
    ...current,
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
})

const signOutMock = mockState.signOutMock.mockImplementation(async () => {
  emitAuthStateChange(null)
  return { error: null }
})

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}))

vi.mock("@/lib/useKV", async () => {
  const ReactModule = await import("react")
  return {
    useKV: <T,>(_key: string, initialValue: T) => ReactModule.useState(initialValue),
  }
})

vi.mock("@/lib/adminAnalytics", () => ({
  isAdminEmail: () => false,
}))

vi.mock("@/lib/sitePath", () => ({
  getSharedSlugFromLocation: () => null,
}))

vi.mock("@/lib/watchPhotoUtils", () => ({
  getWatchPhotoKey: (_userId: string, watchId: string) => `watch_photo_${watchId}`,
  isWatchPhotoRef: () => false,
  sanitizeWatchImageUrl: (value?: string) => value,
  prepareWatchForStorage: async (watch: Watch) => ({
    watchForStorage: watch,
    watchForDisplay: watch,
  }),
}))

vi.mock("@/lib/supabase/client", () => ({
  hasSupabaseBrowserEnv: () => true,
  getSupabaseBrowserEnvStatus: () => ({ isValid: true, missing: [] }),
  getSupabaseClient: () => ({
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: mockState.currentSessionUserId ? { user: { id: mockState.currentSessionUserId } } : null,
        },
      })),
      onAuthStateChange: vi.fn((callback: AuthStateChangeCallback) => {
        mockState.authCallbacks.add(callback)
        return {
          data: {
            subscription: {
              unsubscribe: () => mockState.authCallbacks.delete(callback),
            },
          },
        }
      }),
      signOut: mockState.signOutMock,
    },
  }),
}))

vi.mock("@/lib/db/user", () => ({
  getUserPreferences: mockState.getUserPreferencesMock,
  upsertUserPreferences: mockState.upsertUserPreferencesMock,
  getSharedCollectionBySlug: vi.fn(async () => null),
  upsertUserProfile: mockState.upsertUserProfileMock,
}))

vi.mock("@/lib/db/watches", () => ({
  getWatches: mockState.getWatchesMock,
  createWatch: mockState.createWatchMock,
  updateWatch: mockState.updateWatchMock,
  softDeleteWatch: mockState.softDeleteWatchMock,
}))

vi.mock("@/components/LoginScreen", () => ({
  LoginScreen: ({ onLogin }: { onLogin: (user: User, rememberMe: boolean) => void | Promise<void> }) => (
    <button
      data-testid="login"
      onClick={() => {
        if (mockState.emitSessionOnLogin) {
          emitAuthStateChange("supabase-user-1")
        }
        void onLogin(
          {
            id: "cache-user-1",
            name: "Collector One",
            email: "collector@example.com",
            vaultName: "Collector Vault",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
          true,
        )
      }}
    >
      Login
    </button>
  ),
}))

vi.mock("@/components/AppHeader", () => ({
  AppHeader: ({
    preferredCurrency,
    onCurrencyChange,
    onLogout,
  }: {
    preferredCurrency: string
    onCurrencyChange: (currency: string) => void | Promise<void>
    onLogout: () => void | Promise<void>
  }) => (
    <div>
      <div data-testid="currency">{preferredCurrency}</div>
      <button data-testid="set-currency-chf" onClick={() => void onCurrencyChange("CHF")}>
        Set CHF
      </button>
      <button data-testid="logout" onClick={() => void onLogout()}>
        Logout
      </button>
    </div>
  ),
}))

vi.mock("@/components/modules/CollectionModule", () => ({
  CollectionModule: ({
    watches,
    onUpdate,
  }: {
    watches: Watch[]
    onUpdate: (updater: (currentWatches: Watch[]) => Watch[]) => void | Promise<void>
  }) => (
    <div>
      <div data-testid="watch-count">{watches.length}</div>
      <div data-testid="watch-ids">{watches.map((watch) => watch.id).join(",")}</div>
      <button
        data-testid="add-watch"
        onClick={async () => {
          try {
            await onUpdate((currentWatches) => [
              ...currentWatches,
              {
                id: addedWatchId,
                brand: "Tudor",
                model: "Black Bay 58",
                referenceNumber: "79030N",
                year: 2023,
                purchasePrice: 3500,
                purchaseDate: "2023-05-10",
                condition: "excellent",
                category: "dive",
                movement: "Automatic",
                caseMaterial: "Steel",
                caseDiameter: "39mm",
                hasBox: true,
                hasPapers: true,
              } satisfies Watch,
            ])
          } catch {
            // intentionally ignored by the test harness
          }
        }}
      >
        Add Watch
      </button>
      <button
        data-testid="remove-added-watch"
        onClick={async () => {
          try {
            await onUpdate((currentWatches) => currentWatches.filter((watch) => watch.id !== addedWatchId))
          } catch {
            // intentionally ignored by the test harness
          }
        }}
      >
        Remove Watch
      </button>
    </div>
  ),
}))

vi.mock("@/components/AppSidebar", () => ({
  AppSidebar: () => null,
}))

vi.mock("@/components/MobileNav", () => ({
  MobileNav: () => null,
}))

vi.mock("@/components/WelcomeModal", () => ({
  WelcomeModal: () => null,
}))

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/components/modules/PortfolioModule", () => ({
  PortfolioModule: () => null,
}))

vi.mock("@/components/modules/MarketModule", () => ({
  MarketModule: () => null,
}))

vi.mock("@/components/modules/AIAdvisorModule", () => ({
  AIAdvisorModule: () => null,
}))

vi.mock("@/components/modules/DealsModule", () => ({
  DealsModule: () => null,
}))

vi.mock("@/components/modules/AppraisalModule", () => ({
  AppraisalModule: () => null,
}))

vi.mock("@/components/modules/NewsModule", () => ({
  NewsModule: () => null,
}))

vi.mock("@/components/FeedbackDashboard", () => ({
  FeedbackDashboard: () => null,
}))

vi.mock("@/components/AdminDashboard", () => ({
  AdminDashboard: () => null,
}))

describe("App Supabase persistence flow", () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mockState.kvStore.clear()
    mockState.supabaseWatches.clear()
    mockState.supabasePreferences.clear()
    mockState.authCallbacks.clear()
    mockState.currentSessionUserId = null
    mockState.emitSessionOnLogin = true
    setNavigatorOnline(true)

    getUserPreferencesMock.mockClear()
    upsertUserPreferencesMock.mockClear()
    upsertUserProfileMock.mockClear()
    getWatchesMock.mockClear()
    createWatchMock.mockClear()
    updateWatchMock.mockClear()
    softDeleteWatchMock.mockClear()
    signOutMock.mockClear()

    mockState.supabaseWatches.set(
      existingWatchId,
      createSupabaseWatchRow({
        id: existingWatchId,
        reference: "311.30.42.30.01.005",
        updated_at: "2024-01-02T00:00:00.000Z",
      }),
    )
    mockState.supabasePreferences.set(supabaseUserId, {
      userId: supabaseUserId,
      currency: "EUR",
      locale: "en",
      theme: "dark",
      showPurchasePrices: true,
      emailPriceAlerts: true,
      emailWeeklyDigest: false,
      defaultPortfolioView: "value",
      updatedAt: "2024-01-02T00:00:00.000Z",
    })

    ;(window as typeof window & { spark: typeof window.spark }).spark = {
      llmPrompt: (strings: string[], ...values: unknown[]) =>
        strings.reduce((result, segment, index) => result + segment + String(values[index] ?? ""), ""),
      llm: async () => "",
      user: async () => ({
        avatarUrl: "",
        email: cacheUser.email,
        id: 1,
        isOwner: false,
        login: cacheUser.email,
      }),
      kv: {
        get: async <T,>(key: string) => mockState.kvStore.get(key) as T | undefined,
        set: async <T,>(key: string, value: T) => {
          mockState.kvStore.set(key, value)
        },
        delete: async (key: string) => {
          mockState.kvStore.delete(key)
        },
        keys: async () => Array.from(mockState.kvStore.keys()),
      },
    }

    container = document.createElement("div")
    document.body.innerHTML = ""
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
  })

  it("keeps cache and Supabase watch/preferences data consistent across login, edits, logout, and re-login", async () => {
    await act(async () => {
      root.render(<App />)
    })

    await click("login")

    await waitFor(() => {
      expect(container.querySelector('[data-testid="watch-count"]')?.textContent).toBe("1")
      expect(container.querySelector('[data-testid="currency"]')?.textContent).toBe("EUR")
    })

    await waitFor(() => {
      const cachedPreferences = mockState.kvStore.get(`user_preferences_${cacheUser.id}`) as UserPreferences | undefined
      const cachedWatches = mockState.kvStore.get(`watches_${cacheUser.id}`) as Watch[] | undefined
      expect(cachedPreferences?.currency).toBe("EUR")
      expect(cachedWatches?.map((watch) => watch.id)).toEqual([existingWatchId])
    })

    await click("add-watch")

    await waitFor(() => {
      expect(container.querySelector('[data-testid="watch-count"]')?.textContent).toBe("2")
      expect((mockState.supabaseWatches.get(addedWatchId) as SupabaseWatchRow | undefined)?.deleted_at).toBeNull()
      const cachedWatches = mockState.kvStore.get(`watches_${cacheUser.id}`) as Watch[] | undefined
      expect(cachedWatches?.some((watch) => watch.id === addedWatchId)).toBe(true)
    })

    await click("remove-added-watch")

    await waitFor(() => {
      expect(container.querySelector('[data-testid="watch-count"]')?.textContent).toBe("1")
      expect((mockState.supabaseWatches.get(addedWatchId) as SupabaseWatchRow | undefined)?.deleted_at).toBeTruthy()
      const cachedWatches = mockState.kvStore.get(`watches_${cacheUser.id}`) as Watch[] | undefined
      expect(cachedWatches?.map((watch) => watch.id)).toEqual([existingWatchId])
    })

    await click("set-currency-chf")

    await waitFor(() => {
      expect(container.querySelector('[data-testid="currency"]')?.textContent).toBe("CHF")
      expect((mockState.supabasePreferences.get(supabaseUserId) as UserPreferences | undefined)?.currency).toBe("CHF")
      const cachedPreferences = mockState.kvStore.get(`user_preferences_${cacheUser.id}`) as UserPreferences | undefined
      expect(cachedPreferences?.currency).toBe("CHF")
    })

    await click("logout")

    await waitFor(() => {
      expect(container.querySelector('[data-testid="login"]')).not.toBeNull()
      expect(signOutMock).toHaveBeenCalledTimes(1)
    })

    await click("login")

    await waitFor(() => {
      expect(container.querySelector('[data-testid="watch-count"]')?.textContent).toBe("1")
      expect(container.querySelector('[data-testid="currency"]')?.textContent).toBe("CHF")
      expect(container.querySelector('[data-testid="watch-ids"]')?.textContent).toBe(existingWatchId)
    })

    expect(createWatchMock).toHaveBeenCalledTimes(1)
    expect(softDeleteWatchMock).toHaveBeenCalledTimes(1)
    expect(upsertUserProfileMock).toHaveBeenCalled()
    expect(getUserPreferencesMock).toHaveBeenCalledWith(expect.anything(), supabaseUserId)
  })

  it("migrates legacy KV watches with non-UUID IDs to Supabase with fresh UUIDs", async () => {
    // Seed a legacy KV watch that has a non-UUID id (old format: "watch-<timestamp>").
    const legacyKvId = "watch-1717000000000"
    const legacyKvWatch: Watch = {
      id: legacyKvId,
      brand: "Seiko",
      model: "Presage",
      purchasePrice: 400,
      purchaseDate: "2022-06-01",
      condition: "good",
      category: "dress",
      hasBox: true,
      hasPapers: false,
    }
    mockState.kvStore.set(`watches_${cacheUser.id}`, [legacyKvWatch])
    // Supabase starts empty so the migration path fires.
    mockState.supabaseWatches.clear()

    await act(async () => {
      root.render(<App />)
    })

    await click("login")

    // After migration the watch should appear in the collection.
    await waitFor(() => {
      expect(container.querySelector('[data-testid="watch-count"]')?.textContent).toBe("1")
    })

    // createWatch should have been called once for the legacy watch.
    expect(createWatchMock).toHaveBeenCalledTimes(1)

    // The ID passed to createWatch must be a valid UUID (not the legacy non-UUID id).
    const insertedId: string = createWatchMock.mock.calls[0][0].id
    expect(insertedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(insertedId).not.toBe(legacyKvId)

    // The migrated watch should be visible in Supabase under the new UUID.
    const migratedRow = mockState.supabaseWatches.get(insertedId) as SupabaseWatchRow | undefined
    expect(migratedRow).toBeDefined()
    expect(migratedRow?.brand).toBe("Seiko")
    expect(migratedRow?.deleted_at).toBeNull()
  })

  it("blocks watch CRUD when no Supabase session is available", async () => {
    mockState.emitSessionOnLogin = false

    await act(async () => {
      root.render(<App />)
    })

    await click("login")

    await waitFor(() => {
      expect(container.textContent).toContain("Persistence degraded")
    })

    await click("add-watch")

    await waitFor(() => {
      expect(container.querySelector('[data-testid="watch-count"]')?.textContent).toBe("0")
      expect(createWatchMock).not.toHaveBeenCalled()
    })
  })

  it("queues watch writes while offline and replays them when back online", async () => {
    setNavigatorOnline(false)

    await act(async () => {
      root.render(<App />)
    })

    await click("login")

    await click("add-watch")

    await waitFor(() => {
      expect(container.querySelector('[data-testid="watch-count"]')?.textContent).toBe("1")
      expect(createWatchMock).not.toHaveBeenCalled()
    })

    setNavigatorOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event("online"))
    })

    await waitFor(() => {
      expect(createWatchMock).toHaveBeenCalledTimes(1)
    })
  }, 15000)
})
