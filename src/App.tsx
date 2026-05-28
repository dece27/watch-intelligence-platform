import { useState, useEffect, useRef } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { SharedCollectionRecord, Watch, User, UserPreferences } from "@/lib/types"
import { DEFAULT_CURRENCY, normalizeCurrency } from "@/lib/currency"
import { AppSidebar } from "@/components/AppSidebar"
import { AppHeader } from "@/components/AppHeader"
import { WelcomeModal } from "@/components/WelcomeModal"
import { LoginScreen } from "@/components/LoginScreen"
import { CollectionModule } from "@/components/modules/CollectionModule"
import { PortfolioModule } from "@/components/modules/PortfolioModule"
import { MarketModule } from "@/components/modules/MarketModule"
import { AIAdvisorModule } from "@/components/modules/AIAdvisorModule"
import { DealsModule } from "@/components/modules/DealsModule"
import { AppraisalModule } from "@/components/modules/AppraisalModule"
import { NewsModule } from "@/components/modules/NewsModule"
import { FeedbackDashboard } from "@/components/FeedbackDashboard"
import { AdminDashboard } from "@/components/AdminDashboard"
import { Toaster } from "@/components/ui/sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { MobileNav } from "@/components/MobileNav"
import { isAdminEmail } from "@/lib/adminAnalytics"
import { getSharedSlugFromLocation } from "@/lib/sitePath"
import {
  getWatchPhotoKey,
  isWatchPhotoRef,
  sanitizeWatchImageUrl,
  prepareWatchForStorage,
} from "@/lib/watchPhotoUtils"
import { useKV } from "@/lib/useKV"
import { hasSupabaseBrowserEnv, getSupabaseBrowserEnvStatus, getSupabaseClient } from "@/lib/supabase/client"
import { getWatches, createWatch, updateWatch, softDeleteWatch, WatchConflictError } from "@/lib/db/watches"
import { getUserPreferences, upsertUserPreferences, getSharedCollectionBySlug, upsertUserProfile } from "@/lib/db/user"
import { watchToInsert, watchToUpdate, rowToWatch } from "@/lib/db/watchMapper"
import { getEstimatedMarketValue } from "@/lib/watchValue"
import { toast } from "sonner"

function decodeLegacySharedSlug(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
    const decoded = atob(normalized)
    return decoded || null
  } catch {
    return null
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

function getUserPreferencesKey(userId: string): string {
  return `user_preferences_${userId}`
}

function getUserWatchesKey(userId: string): string {
  return `watches_${userId}`
}

function normalizeWatchForDisplay(watch: Watch): Watch {
  const normalizedBrand = typeof watch.brand === 'string' ? watch.brand.trim() : ''
  const normalizedModel = typeof watch.model === 'string' ? watch.model.trim() : ''

  return {
    ...watch,
    brand: normalizedBrand || 'Unknown',
    model: normalizedModel || 'Unknown Model',
  }
}

async function syncCachedUserPreferences(userId: string, currency: string): Promise<void> {
  const key = getUserPreferencesKey(userId)
  const existing = await window.spark.kv.get<UserPreferences>(key)
  await window.spark.kv.set(key, {
    ...(existing || {}),
    userId,
    currency: normalizeCurrency(currency),
    updatedAt: new Date().toISOString(),
  } satisfies UserPreferences)
}

async function syncCachedWatches(userId: string, nextWatches: Watch[]): Promise<void> {
  await window.spark.kv.set(getUserWatchesKey(userId), nextWatches)
}

const SUPABASE_DEFAULT_PREFERENCES = {
  locale: 'en',
  theme: 'dark' as const,
  showPurchasePrices: true,
  emailPriceAlerts: true,
  emailWeeklyDigest: false,
  defaultPortfolioView: 'value' as const,
}

type PersistenceState = 'initializing' | 'supabase-ready' | 'degraded' | 'offline'

type WatchOutboxOperation = {
  idempotencyKey: string
  type: 'create' | 'update' | 'delete'
  watchId: string
  watch?: Watch
  expectedUpdatedAt?: string
  queuedAt: string
  failedAt?: string
  failureReason?: string
}

type LegacyPhotoMigrationCandidate = {
  id: string
  imageUrl: string
  expectedUpdatedAt: string
}

type HydratedWatchResult = {
  displayWatch: Watch
  cacheWatch: Watch
  migrationCandidate: LegacyPhotoMigrationCandidate | null
}

function getWatchOutboxKey(userId: string): string {
  return `watch_outbox_${userId}`
}

function App() {
  const [persistedUser, setPersistedUser] = useKV<User | null>("currentUser", null)
  const [currentUser, setCurrentUser] = useState<User | null>(persistedUser ?? null)
  const [activeModule, setActiveModule] = useState('collection')
  const [showWelcome, setShowWelcome] = useState(true)
  const [triggerAddWatch, setTriggerAddWatch] = useState(false)
  const [watches, setWatches] = useState<Watch[]>([])
  const [watchesLoaded, setWatchesLoaded] = useState(false)
  const [sharedSlug, setSharedSlug] = useState<string | null>(null)
  const [sharedCollection, setSharedCollection] = useState<SharedCollectionRecord | null>(null)
  const [sharedLoading, setSharedLoading] = useState(false)
  const [sharedError, setSharedError] = useState<string | null>(null)
  const [preferredCurrency, setPreferredCurrency] = useState(DEFAULT_CURRENCY)
  // Supabase Auth user ID derived from the live session — never stored in
  // any browser storage; re-derived from the session on every mount/login.
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null)
  const [supabaseAuthResolved, setSupabaseAuthResolved] = useState(false)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [watchRevisionById, setWatchRevisionById] = useState<Record<string, string>>({})
  const [watchSyncStateById, setWatchSyncStateById] = useState<Record<string, 'pending_sync' | 'failed_sync'>>({})
  const replayingOutboxRef = useRef(false)
  const isMobile = useIsMobile()

  // Subscribe to Supabase Auth state changes to keep supabaseUserId in sync.
  useEffect(() => {
    if (!hasSupabaseBrowserEnv()) {
      setSupabaseAuthResolved(true)
      return
    }

    const client = getSupabaseClient()

    // Populate from any existing session immediately.
    void client.auth.getSession().then(({ data }) => {
      setSupabaseUserId(data.session?.user.id ?? null)
      setSupabaseAuthResolved(true)
    }).catch(() => {
      setSupabaseUserId(null)
      setSupabaseAuthResolved(true)
    })

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setSupabaseUserId(session?.user.id ?? null)
      setSupabaseAuthResolved(true)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const updateSharedSlugFromLocation = () => {
      setSharedSlug(
        getSharedSlugFromLocation(
          window.location.pathname,
          window.location.hash,
          import.meta.env.BASE_URL,
        )
      )
    }

    updateSharedSlugFromLocation()
    window.addEventListener("hashchange", updateSharedSlugFromLocation)
    window.addEventListener("popstate", updateSharedSlugFromLocation)

    return () => {
      window.removeEventListener("hashchange", updateSharedSlugFromLocation)
      window.removeEventListener("popstate", updateSharedSlugFromLocation)
    }
  }, [])

  useEffect(() => {
    const loadSharedCollection = async () => {
      if (!sharedSlug) return

      setSharedLoading(true)
      setSharedError(null)
      try {
        // Supabase path: look up by slug in the database first so shared
        // collections survive beyond local storage and are accessible across
        // devices.
        if (hasSupabaseBrowserEnv()) {
          try {
            const client = getSupabaseClient()
            const supabaseShared = await getSharedCollectionBySlug(client, sharedSlug)
            if (supabaseShared) {
              setSharedCollection(supabaseShared)
              return
            }
          } catch {
            // Non-fatal: fall through to KV lookup.
          }
        }

        // KV path: used when Supabase is unavailable or the slug was created
        // before the Supabase migration, including legacy base64-encoded slugs.
        const key = `shared_collection_${sharedSlug}`
        let shared = await window.spark.kv.get<SharedCollectionRecord>(key)

        if (!shared) {
          const decodedSlug = decodeLegacySharedSlug(sharedSlug)
          if (decodedSlug && decodedSlug !== sharedSlug) {
            shared = await window.spark.kv.get<SharedCollectionRecord>(`shared_collection_${decodedSlug}`)
          }
        }

        if (!shared) {
          setSharedCollection(null)
          setSharedError("This shared collection link is invalid or has expired.")
          return
        }

        setSharedCollection(shared)
      } catch (error) {
        console.error("Failed to load shared collection:", error)
        setSharedCollection(null)
        setSharedError("Unable to load shared collection.")
      } finally {
        setSharedLoading(false)
      }
    }

    loadSharedCollection()
  }, [sharedSlug])

  useEffect(() => {
    if (persistedUser) {
      setCurrentUser(persistedUser)
      return
    }

    try {
      const sessionUser = sessionStorage.getItem("currentUserSession")
      if (sessionUser) {
        setCurrentUser(JSON.parse(sessionUser) as User)
      }
    } catch {
      setCurrentUser(null)
    }
  }, [persistedUser])

  const supabaseEnvStatus = getSupabaseBrowserEnvStatus()
  const persistenceState: PersistenceState = !currentUser
    ? 'initializing'
    : !supabaseEnvStatus.isValid
      ? 'degraded'
      : !supabaseAuthResolved
        ? 'initializing'
        : !supabaseUserId
          ? 'degraded'
          : !isOnline
            ? 'offline'
            : 'supabase-ready'

  const pendingSyncCount = Object.values(watchSyncStateById).filter((state) => state === 'pending_sync').length
  const failedSyncCount = Object.values(watchSyncStateById).filter((state) => state === 'failed_sync').length

  const persistenceStateMessage = (() => {
    if (!currentUser) return null
    if (persistenceState === 'supabase-ready' && failedSyncCount === 0) return null
    if (persistenceState === 'supabase-ready' && failedSyncCount > 0) {
      return `${failedSyncCount} watch change${failedSyncCount === 1 ? '' : 's'} failed to sync. Retry once connection and session health are stable.`
    }
    if (persistenceState === 'initializing') {
      return 'Initializing secure persistence session…'
    }
    if (persistenceState === 'offline') {
      const syncSummary = pendingSyncCount > 0
        ? ` ${pendingSyncCount} watch change${pendingSyncCount === 1 ? '' : 's'} pending sync.`
        : ''
      return `Offline mode: watch changes are staged locally and will sync when connectivity returns.${syncSummary}`
    }
    if (!supabaseEnvStatus.isValid) {
      return `Supabase configuration is invalid. Missing environment variables: ${supabaseEnvStatus.missing.join(', ')}.`
    }
    return 'Persistence degraded: no Supabase session is available, so watch updates are blocked until you sign in again.'
  })()

  useEffect(() => {
    let active = true

    const ensureSupabaseBootstrapData = async () => {
      if (!currentUser?.id || !supabaseUserId || persistenceState !== 'supabase-ready') return

      try {
        const client = getSupabaseClient()

        await upsertUserProfile(client, {
          id: supabaseUserId,
          displayName: currentUser.name,
          isPublic: false,
        })

        const key = getUserPreferencesKey(currentUser.id)
        const stored = await window.spark.kv.get<UserPreferences>(key)
        const existingPreferences = await getUserPreferences(client, supabaseUserId)
        if (!existingPreferences) {
          await upsertUserPreferences(client, {
            userId: supabaseUserId,
            currency: normalizeCurrency(stored?.currency),
            ...SUPABASE_DEFAULT_PREFERENCES,
          })
        }
      } catch (error) {
        if (!active) return
        console.error('Error ensuring Supabase bootstrap data:', error)
      }
    }

    void ensureSupabaseBootstrapData()
    return () => {
      active = false
    }
  }, [currentUser?.id, currentUser?.name, supabaseUserId, persistenceState])

  useEffect(() => {
    let active = true

    const loadPreferences = async () => {
      if (!currentUser?.id) {
        if (active) setPreferredCurrency(DEFAULT_CURRENCY)
        return
      }

      try {
        const key = getUserPreferencesKey(currentUser.id)
        const stored = await window.spark.kv.get<UserPreferences>(key)

        // Supabase path: load preferences from DB when a session is available.
        if (supabaseUserId && persistenceState === 'supabase-ready') {
          const client = getSupabaseClient()
          const prefs = await getUserPreferences(client, supabaseUserId)
          if (!active) return
          if (prefs) {
            const normalizedCurrency = normalizeCurrency(prefs.currency)
            await syncCachedUserPreferences(currentUser.id, normalizedCurrency)
            if (!active) return
            setPreferredCurrency(normalizedCurrency)
            return
          }

          const normalizedCurrency = normalizeCurrency(stored?.currency)
          await upsertUserPreferences(client, {
            userId: supabaseUserId,
            currency: normalizedCurrency,
            ...SUPABASE_DEFAULT_PREFERENCES,
          })
          await syncCachedUserPreferences(currentUser.id, normalizedCurrency)
          if (!active) return
          setPreferredCurrency(normalizedCurrency)
          return
        }

        // KV fallback.
        if (!active) return
        setPreferredCurrency(normalizeCurrency(stored?.currency))
      } catch {
        if (!active) return
        setPreferredCurrency(DEFAULT_CURRENCY)
      }
    }

    void loadPreferences()
    return () => {
      active = false
    }
  }, [currentUser?.id, supabaseUserId, persistenceState])

  const watchList = watches || []
  const totalValue = watchList.reduce((sum, w) => sum + getEstimatedMarketValue(w), 0)
  const activeUserId = supabaseUserId ?? undefined

  useEffect(() => {
    const loadWatches = async () => {
      if (!currentUser?.id) {
        setWatches([])
        setWatchRevisionById({})
        setWatchSyncStateById({})
        setWatchesLoaded(false)
        return
      }

      if (persistenceState === 'initializing') {
        setWatchesLoaded(false)
        return
      }

      try {
        // Supabase path: fetch rows from DB and hydrate photo refs from KV.
        if (supabaseUserId && persistenceState === 'supabase-ready') {
          let rows = await getWatches(supabaseUserId, { limit: 1000, offset: 0 })
          const kvWatches = (await window.spark.kv.get<Watch[]>(getUserWatchesKey(currentUser.id))) || []
          const pendingOutboxOps =
            (await window.spark.kv.get<WatchOutboxOperation[]>(getWatchOutboxKey(currentUser.id))) || []
          const supabaseWatchIds = new Set(rows.map((row) => row.id))
          const missingKvWatches = kvWatches.filter((watch) => !supabaseWatchIds.has(watch.id))

          if (missingKvWatches.length > 0 && pendingOutboxOps.length === 0) {
            const prepared = await Promise.all(
              missingKvWatches.map(async (watch) => {
                // Legacy KV watches may have non-UUID IDs (e.g. "watch-<timestamp>").
                // Supabase requires a valid UUID for the primary key, so generate
                // a fresh one for any watch that doesn't already have one.
                const migratedWatch = isValidUuid(watch.id)
                  ? watch
                  : { ...watch, id: crypto.randomUUID() }

                const legacyPhoto = isWatchPhotoRef(watch.imageUrl)
                  ? (
                      (await window.spark.kv.get<string>(getWatchPhotoKey(currentUser.id, watch.id)))
                      ?? (await window.spark.kv.get<string>(getWatchPhotoKey(supabaseUserId, watch.id)))
                    )
                  : undefined

                return prepareWatchForStorage(
                  legacyPhoto
                    ? { ...migratedWatch, imageUrl: legacyPhoto }
                    : migratedWatch,
                  supabaseUserId,
                  (key, value) => window.spark.kv.set(key, value),
                )
              }),
            )

            await Promise.all(
              prepared.map(({ watchForStorage }) =>
                createWatch(watchToInsert(watchForStorage, supabaseUserId)),
              ),
            )
            rows = await getWatches(supabaseUserId, { limit: 1000, offset: 0 })
          }

          const hydratedResults = await Promise.all(
            rows.map(async (row): Promise<HydratedWatchResult> => {
              const watch = rowToWatch(row)
              const rawImage = watch.imageUrl
              if (!rawImage) {
                return {
                  displayWatch: watch,
                  cacheWatch: watch,
                  migrationCandidate: null,
                }
              }

              if (isWatchPhotoRef(rawImage)) {
                let storedPhoto: string | undefined = undefined
                try {
                  storedPhoto =
                    (await window.spark.kv.get<string>(
                      getWatchPhotoKey(supabaseUserId, watch.id),
                    )) ?? undefined
                } catch (error) {
                  console.error(`Error loading watch photo for ${watch.id}:`, error)
                }

                const sanitizedStoredPhoto = sanitizeWatchImageUrl(storedPhoto)
                return {
                  displayWatch: { ...watch, imageUrl: sanitizedStoredPhoto },
                  cacheWatch: watch,
                  migrationCandidate: sanitizedStoredPhoto
                    ? {
                        id: watch.id,
                        imageUrl: sanitizedStoredPhoto,
                        expectedUpdatedAt: row.updated_at,
                      }
                    : null,
                }
              }

              const sanitizedRawImage = sanitizeWatchImageUrl(rawImage)
              const sanitizedWatch = { ...watch, imageUrl: sanitizedRawImage }
              return {
                displayWatch: sanitizedWatch,
                cacheWatch: sanitizedWatch,
                migrationCandidate: null,
              }
            }),
          )

          const legacyPhotoMigrations = hydratedResults
            .map((result) => result.migrationCandidate)
            .filter((candidate): candidate is LegacyPhotoMigrationCandidate => candidate !== null)

          const successfulLegacyMigrations = new Map<string, Watch>()
          const nextRevisions = Object.fromEntries(rows.map((row) => [row.id, row.updated_at]))

          if (legacyPhotoMigrations.length > 0) {
            const migrationResults = await Promise.allSettled(
              legacyPhotoMigrations.map((candidate) =>
                updateWatch(
                  candidate.id,
                  { cover_photo_url: candidate.imageUrl },
                  { expectedUpdatedAt: candidate.expectedUpdatedAt },
                ),
              ),
            )

            for (const result of migrationResults) {
              if (result.status === 'fulfilled') {
                successfulLegacyMigrations.set(result.value.id, rowToWatch(result.value))
                nextRevisions[result.value.id] = result.value.updated_at
              }
            }
          }

          const hydratedWatches = hydratedResults.map((result) =>
            successfulLegacyMigrations.get(result.displayWatch.id) ?? result.displayWatch,
          )
          const cachedWatches = hydratedResults.map((result) =>
            successfulLegacyMigrations.get(result.displayWatch.id) ?? result.displayWatch,
          )

          await syncCachedWatches(currentUser.id, cachedWatches)
          setWatchRevisionById(nextRevisions)
          setWatchSyncStateById({})
          setWatches(hydratedWatches)
          setWatchesLoaded(true)
          return
        }

        // Cached view path for offline/degraded states.
        const watchesKey = getUserWatchesKey(currentUser.id)
        const loadedWatches = (await window.spark.kv.get<Watch[]>(watchesKey)) || []
        const photoUserId = supabaseUserId ?? currentUser.id
        const hydratedWatches = await Promise.all(
          loadedWatches.map(async (watch) => {
            const normalizedWatch = normalizeWatchForDisplay(watch)
            const rawImage = watch.imageUrl
            if (!rawImage) {
              return { ...normalizedWatch, imageUrl: undefined }
            }

            if (isWatchPhotoRef(rawImage)) {
              let storedPhoto: string | undefined = undefined
              try {
                storedPhoto =
                  (await window.spark.kv.get<string>(
                    getWatchPhotoKey(photoUserId, watch.id),
                  )) ?? undefined
              } catch (error) {
                console.error(`Error loading watch photo for ${watch.id}:`, error)
              }
              return {
                ...normalizedWatch,
                imageUrl: sanitizeWatchImageUrl(storedPhoto),
              }
            }

            return {
              ...normalizedWatch,
              imageUrl: sanitizeWatchImageUrl(rawImage),
            }
          }),
        )

        setWatches(hydratedWatches)
        setWatchesLoaded(true)
      } catch (error) {
        console.error('Error loading watches:', error)
        setWatches([])
        setWatchRevisionById({})
        setWatchesLoaded(true)
      }
    }
    loadWatches()
  }, [currentUser, supabaseUserId, persistenceState])

  const handleLogin = async (user: User, rememberMe: boolean) => {
    setCurrentUser(user)
    if (rememberMe) {
      await setPersistedUser(user)
      try {
        sessionStorage.removeItem("currentUserSession")
      } catch {
        // sessionStorage may be unavailable in sandboxed environments
      }
      return
    }

    await setPersistedUser(null)
    try {
      sessionStorage.setItem("currentUserSession", JSON.stringify(user))
    } catch {
      // sessionStorage may be unavailable in sandboxed environments
    }
  }

  const handleLogout = async () => {
    // Sign out from Supabase Auth when a session exists.
    if (hasSupabaseBrowserEnv()) {
      try {
        await getSupabaseClient().auth.signOut()
      } catch {
        // Non-fatal: session cleanup best-effort only.
      }
    }

    await setPersistedUser(null)
    try {
      sessionStorage.removeItem("currentUserSession")
    } catch {
      // sessionStorage may be unavailable in sandboxed environments
    }
    setCurrentUser(null)
    setActiveModule('collection')
  }

  const handleCurrencyChange = async (currency: string) => {
    const normalizedCurrency = normalizeCurrency(currency)
    setPreferredCurrency(normalizedCurrency)
    if (!currentUser?.id) return

    // Supabase path.
    if (supabaseUserId && persistenceState === 'supabase-ready') {
      try {
        const client = getSupabaseClient()
        await upsertUserPreferences(client, {
          userId: supabaseUserId,
          currency: normalizedCurrency,
          locale: 'en',
          theme: 'dark',
          showPurchasePrices: true,
          emailPriceAlerts: true,
          emailWeeklyDigest: false,
          defaultPortfolioView: 'value',
        })
        await syncCachedUserPreferences(currentUser.id, normalizedCurrency)
      } catch (error) {
        console.error('Failed to save currency preference:', error)
        toast.error('Could not save currency preference. Please retry.')
      }
      return
    }

    toast.error('Preferences are unavailable until Supabase persistence is ready.')
  }

  const handleAddFirstWatch = () => {
    setActiveModule('collection')
    setShowWelcome(false)
    setTriggerAddWatch(true)
  }

  useEffect(() => {
    const replayWatchOutbox = async () => {
      if (!currentUser?.id || !supabaseUserId || persistenceState !== 'supabase-ready' || replayingOutboxRef.current) return

      replayingOutboxRef.current = true
      const outboxKey = getWatchOutboxKey(currentUser.id)
      try {
        const queued = (await window.spark.kv.get<WatchOutboxOperation[]>(outboxKey)) || []
        if (queued.length === 0) return

        const remaining: WatchOutboxOperation[] = []
        const failedStates: Record<string, 'failed_sync'> = {}
        const nextRevisions = { ...watchRevisionById }

        for (const operation of queued) {
          try {
            if (operation.type === 'delete') {
              await softDeleteWatch(operation.watchId)
              delete nextRevisions[operation.watchId]
              continue
            }

            if (!operation.watch) {
              throw new Error(`Missing watch payload for ${operation.type} operation`)
            }

            if (operation.type === 'create') {
              const created = await createWatch(watchToInsert(operation.watch, supabaseUserId))
              nextRevisions[created.id] = created.updated_at
              continue
            }

            const updated = await updateWatch(
              operation.watchId,
              watchToUpdate(operation.watch),
              { expectedUpdatedAt: operation.expectedUpdatedAt },
            )
            nextRevisions[updated.id] = updated.updated_at
          } catch (error) {
            failedStates[operation.watchId] = 'failed_sync'
            remaining.push({
              ...operation,
              failedAt: new Date().toISOString(),
              failureReason: error instanceof Error ? error.message : 'Unknown sync error',
            })
            // Preserve deterministic ordering: stop replay on first failure so
            // later operations are not applied out of sequence.
            break
          }
        }

        await window.spark.kv.set(outboxKey, remaining)
        setWatchRevisionById(nextRevisions)
        setWatchSyncStateById(failedStates)

        if (remaining.length === 0) {
          const rows = await getWatches(supabaseUserId, { limit: 1000, offset: 0 })
          const storageWatches = rows.map((row) => rowToWatch(row))
          await syncCachedWatches(currentUser.id, storageWatches)
          setWatches(storageWatches)
          setWatchRevisionById(Object.fromEntries(rows.map((row) => [row.id, row.updated_at])))
          toast.success('Offline watch changes synced successfully.')
        } else {
          toast.error('Some queued watch changes failed to sync. Resolve conflicts and retry.')
        }
      } finally {
        replayingOutboxRef.current = false
      }
    }

    void replayWatchOutbox()
  }, [currentUser, persistenceState, supabaseUserId, watchRevisionById])

  const handleUpdateWatches = async (updater: (currentWatches: Watch[]) => Watch[]) => {
    if (!currentUser?.id) return
    const prevWatches = watches
    const nextWatches = updater(prevWatches)
    const storageUserId = supabaseUserId ?? currentUser.id

    const prepared = await Promise.all(
      nextWatches.map((watch) => {
        const existingDisplayUrl = prevWatches.find((w) => w.id === watch.id)?.imageUrl
        return prepareWatchForStorage(
          watch,
          storageUserId,
          (key, value) => window.spark.kv.set(key, value),
          existingDisplayUrl,
        )
      }),
    )
    const preparedById = new Map(prepared.map((item) => [item.watchForStorage.id, item.watchForStorage]))
    const prevIds = new Set(prevWatches.map((w) => w.id))
    const nextIds = new Set(nextWatches.map((w) => w.id))

    if (supabaseUserId && persistenceState === 'supabase-ready') {
      try {
        const deletedIds = prevWatches.filter((w) => !nextIds.has(w.id)).map((watch) => watch.id)
        const createdOrUpdated = await Promise.all(
          prepared.map(({ watchForStorage }) => {
            if (!prevIds.has(watchForStorage.id)) {
              return createWatch(watchToInsert(watchForStorage, supabaseUserId))
            }
            return updateWatch(watchForStorage.id, watchToUpdate(watchForStorage), {
              expectedUpdatedAt: watchRevisionById[watchForStorage.id],
            })
          }),
        )

        await Promise.all(deletedIds.map((id) => softDeleteWatch(id)))

        const nextRevisions = { ...watchRevisionById }
        for (const row of createdOrUpdated) {
          nextRevisions[row.id] = row.updated_at
        }
        for (const deletedId of deletedIds) {
          delete nextRevisions[deletedId]
        }
        await syncCachedWatches(
          currentUser.id,
          prepared.map((item) => item.watchForStorage),
        )
        setWatchRevisionById(nextRevisions)
        setWatchSyncStateById({})
        setWatches(prepared.map((p) => p.watchForDisplay))
        console.log(`Synced ${nextWatches.length} watches to Supabase`)
      } catch (error) {
        console.error('Error syncing watches to Supabase:', error)
        if (error instanceof WatchConflictError) {
          toast.error('Another session modified this watch. Refresh data and retry your change.')
        }
        throw error
      }
      return
    }

    if (supabaseUserId && persistenceState === 'offline') {
      const outboxKey = getWatchOutboxKey(currentUser.id)
      const queued = (await window.spark.kv.get<WatchOutboxOperation[]>(outboxKey)) || []
      const queuedAt = new Date().toISOString()

      const operations: WatchOutboxOperation[] = [
        ...prevWatches
          .filter((watch) => !nextIds.has(watch.id))
          .map((watch) => ({
            idempotencyKey: crypto.randomUUID(),
            type: 'delete' as const,
            watchId: watch.id,
            expectedUpdatedAt: watchRevisionById[watch.id],
            queuedAt,
          })),
        ...prepared.map(({ watchForStorage }) => ({
          idempotencyKey: crypto.randomUUID(),
          type: (prevIds.has(watchForStorage.id) ? 'update' : 'create') as 'update' | 'create',
          watchId: watchForStorage.id,
          watch: watchForStorage,
          expectedUpdatedAt: watchRevisionById[watchForStorage.id],
          queuedAt,
        })),
      ]

      await window.spark.kv.set(outboxKey, [...queued, ...operations])
      await syncCachedWatches(
        currentUser.id,
        prepared.map((item) => item.watchForStorage),
      )
      setWatches(prepared.map((item) => item.watchForDisplay))
      setWatchSyncStateById((current) => ({
        ...current,
        ...Object.fromEntries(
          operations.map((operation) => [operation.watchId, 'pending_sync' as const]),
        ),
      }))
      toast.warning('Saved offline. Changes will sync automatically when you reconnect.')
      return
    }

    setWatchSyncStateById((current) => ({
      ...current,
      ...Object.fromEntries(
        Array.from(preparedById.keys()).map((watchId) => [watchId, 'failed_sync' as const]),
      ),
    }))
    throw new Error('Supabase persistence is not ready. Watch changes are blocked until session recovery completes.')
  }

  const isAdmin = isAdminEmail(currentUser?.email)

  const renderModule = () => {
    switch (activeModule) {
      case 'collection':
        return (
          <CollectionModule
            watches={watchList}
            onUpdate={handleUpdateWatches}
            triggerAdd={triggerAddWatch}
            onTriggerComplete={() => setTriggerAddWatch(false)}
            currentUserId={activeUserId}
            vaultName={currentUser?.vaultName}
            preferredCurrency={preferredCurrency}
          />
        )
      case 'portfolio':
        return (
          <PortfolioModule
            watches={watchList}
            onUpdate={handleUpdateWatches}
            preferredCurrency={preferredCurrency}
          />
        )
      case 'market':
        return <MarketModule watches={watchList} preferredCurrency={preferredCurrency} />
      case 'ai-advisor':
        return <AIAdvisorModule watches={watchList} userId={activeUserId || ""} preferredCurrency={preferredCurrency} />
      case 'deals':
        return <DealsModule watches={watchList} userId={activeUserId || ""} preferredCurrency={preferredCurrency} />
      case 'appraisal':
        return <AppraisalModule watches={watchList} preferredCurrency={preferredCurrency} />
      case 'news':
        return <NewsModule watches={watchList} />
      case 'feedback':
        return isAdmin ? (
          <FeedbackDashboard />
        ) : (
          <CollectionModule
            watches={watchList}
            onUpdate={handleUpdateWatches}
            currentUserId={activeUserId}
            vaultName={currentUser?.vaultName}
            preferredCurrency={preferredCurrency}
          />
        )
      case 'admin-dashboard':
        return isAdmin ? (
          <AdminDashboard />
        ) : (
          <CollectionModule
            watches={watchList}
            onUpdate={handleUpdateWatches}
            currentUserId={activeUserId}
            vaultName={currentUser?.vaultName}
            preferredCurrency={preferredCurrency}
          />
        )
      default:
        return (
          <CollectionModule
            watches={watchList}
            onUpdate={handleUpdateWatches}
            currentUserId={activeUserId}
            vaultName={currentUser?.vaultName}
            preferredCurrency={preferredCurrency}
          />
        )
    }
  }

  if (sharedSlug) {
    if (sharedLoading) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <p className="text-muted-foreground">Loading shared collection…</p>
        </div>
      )
    }

    if (sharedError || !sharedCollection) {
      return (
        <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 gap-4 text-center">
          <h1 className="text-2xl font-semibold">Shared collection unavailable</h1>
          <p className="text-muted-foreground">{sharedError || "This shared link could not be loaded."}</p>
        </div>
      )
    }

    const sharedWatches: Watch[] = sharedCollection.watches.map((watch) => ({
      ...watch,
      purchasePrice: 0,
      purchaseDate: "",
    }))

    return (
      <div className="min-h-screen bg-background text-foreground p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <CollectionModule
            watches={sharedWatches}
            onUpdate={() => {}}
            readOnly
            hidePurchasePrice
            preferredCurrency={preferredCurrency}
            title={`${sharedCollection.ownerVaultName} — Shared Collection`}
            subtitle={`${sharedCollection.watches.length} ${sharedCollection.watches.length === 1 ? "watch" : "watches"} in this public view`}
          />
        </div>
        <Toaster />
      </div>
    )
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {!isMobile && <AppSidebar activeModule={activeModule} onModuleChange={setActiveModule} isAdmin={isAdmin} />}
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader
          totalValue={totalValue}
          isMobile={isMobile}
          user={currentUser}
          onLogout={handleLogout}
          preferredCurrency={preferredCurrency}
          onCurrencyChange={handleCurrencyChange}
        />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <div className="max-w-7xl mx-auto">
            {persistenceStateMessage && (
              <Alert variant={persistenceState === 'degraded' || failedSyncCount > 0 ? 'destructive' : 'default'} className="mb-4">
                <AlertTitle>
                  {persistenceState === 'offline' ? 'Persistence offline' : 'Persistence status'}
                </AlertTitle>
                <AlertDescription>{persistenceStateMessage}</AlertDescription>
              </Alert>
            )}
            {renderModule()}
          </div>
        </main>
      </div>

      {isMobile && <MobileNav activeModule={activeModule} onModuleChange={setActiveModule} isAdmin={isAdmin} />}

      <WelcomeModal
        open={watchesLoaded && watchList.length === 0 && showWelcome}
        onAddWatch={handleAddFirstWatch} 
        onOpenChange={setShowWelcome}
      />
      
      <Toaster />
    </div>
  )
}

export default App
