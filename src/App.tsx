import { useState, useEffect } from "react"
import { useKV } from "@github/spark/hooks"
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
import { FeedbackDashboard } from "@/components/FeedbackDashboard"
import { AdminDashboard } from "@/components/AdminDashboard"
import { Toaster } from "@/components/ui/sonner"
import { MobileNav } from "@/components/MobileNav"
import { isAdminEmail } from "@/lib/adminAnalytics"

const WATCH_PHOTO_KEY_PREFIX = "watch_photo_"
const WATCH_PHOTO_REF_PREFIX = "kv-photo:"
const MAX_DATA_IMAGE_URL_LENGTH = 800_000
const MAX_REMOTE_IMAGE_URL_LENGTH = 2_048

function getWatchPhotoKey(userId: string, watchId: string): string {
  return `${WATCH_PHOTO_KEY_PREFIX}${userId}_${watchId}`
}

function toWatchPhotoRef(watchId: string): string {
  return `${WATCH_PHOTO_REF_PREFIX}${watchId}`
}

function isWatchPhotoRef(imageUrl?: string): boolean {
  return Boolean(imageUrl?.startsWith(WATCH_PHOTO_REF_PREFIX))
}

function sanitizeWatchImageUrl(imageUrl?: string): string | undefined {
  if (!imageUrl) return undefined
  const trimmed = imageUrl.trim()
  if (!trimmed) return undefined

  if (trimmed.startsWith("data:image/")) {
    const isSafeDataImage = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed)
    if (!isSafeDataImage || trimmed.length > MAX_DATA_IMAGE_URL_LENGTH) return undefined
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "https:") return undefined
    if (trimmed.length > MAX_REMOTE_IMAGE_URL_LENGTH) return undefined
    return parsed.toString()
  } catch {
    return undefined
  }
}

function decodeLegacySharedSlug(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
    const decoded = atob(normalized)
    return decoded || null
  } catch {
    return null
  }
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
  const isMobile = useIsMobile()

  useEffect(() => {
    const [first, second] = window.location.pathname.split("/").filter(Boolean)
    if (first === "shared" && second) {
      setSharedSlug(decodeURIComponent(second))
    }
  }, [])

  useEffect(() => {
    const loadSharedCollection = async () => {
      if (!sharedSlug) return

      setSharedLoading(true)
      setSharedError(null)
      try {
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

  useEffect(() => {
    let active = true

    const loadPreferences = async () => {
      if (!currentUser?.id) {
        if (active) setPreferredCurrency(DEFAULT_CURRENCY)
        return
      }

      try {
        const key = `user_preferences_${currentUser.id}`
        const stored = await window.spark.kv.get<UserPreferences>(key)
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
  }, [currentUser?.id])

  const watchList = watches || []
  const totalValue = watchList.reduce((sum, w) => sum + (w.currentValue || w.purchasePrice), 0)

  useEffect(() => {
    const loadWatches = async () => {
      if (currentUser?.id) {
        try {
          const watchesKey = `watches_${currentUser.id}`
          const loadedWatches = await window.spark.kv.get<Watch[]>(watchesKey) || []
          const hydratedWatches = await Promise.all(
            loadedWatches.map(async (watch) => {
              const rawImage = watch.imageUrl
              if (!rawImage) {
                return { ...watch, imageUrl: undefined }
              }

              if (isWatchPhotoRef(rawImage)) {
                let storedPhoto: string | undefined = undefined
                try {
                  storedPhoto = await window.spark.kv.get<string>(getWatchPhotoKey(currentUser.id, watch.id)) ?? undefined
                } catch (error) {
                  console.error(`Error loading watch photo for ${watch.id}:`, error)
                }
                return {
                  ...watch,
                  imageUrl: sanitizeWatchImageUrl(storedPhoto),
                }
              }

              return {
                ...watch,
                imageUrl: sanitizeWatchImageUrl(rawImage),
              }
            })
          )

          setWatches(hydratedWatches)
          setWatchesLoaded(true)
        } catch (error) {
          console.error('Error loading watches:', error)
          setWatches([])
          setWatchesLoaded(true)
        }
      } else {
        setWatches([])
        setWatchesLoaded(false)
      }
    }
    loadWatches()
  }, [currentUser])

  const handleLogin = async (user: User, rememberMe: boolean) => {
    setCurrentUser(user)
    if (rememberMe) {
      await setPersistedUser(user)
      sessionStorage.removeItem("currentUserSession")
      return
    }

    await setPersistedUser(null)
    sessionStorage.setItem("currentUserSession", JSON.stringify(user))
  }

  const handleLogout = async () => {
    if (currentUser) {
      await window.spark.kv.set(`vaultMetadata_${currentUser.id}`, {
        userId: currentUser.id,
        vaultName: currentUser.vaultName,
        createdAt: currentUser.createdAt,
        lastAccessed: new Date().toISOString(),
        watchCount: watchList.length,
        totalValue: totalValue
      })
    }

    await setPersistedUser(null)
    sessionStorage.removeItem("currentUserSession")
    setCurrentUser(null)
    setActiveModule('collection')
  }

  const handleCurrencyChange = async (currency: string) => {
    const normalizedCurrency = normalizeCurrency(currency)
    setPreferredCurrency(normalizedCurrency)
    if (!currentUser?.id) return

    const key = `user_preferences_${currentUser.id}`
    try {
      const existing = await window.spark.kv.get<UserPreferences>(key)
      await window.spark.kv.set(key, {
        ...(existing || {}),
        userId: currentUser.id,
        currency: normalizedCurrency,
        updatedAt: new Date().toISOString(),
      } satisfies UserPreferences)
    } catch {
      // Silent persistence failure; UI remains functional.
    }
  }

  const handleAddFirstWatch = () => {
    setActiveModule('collection')
    setShowWelcome(false)
    setTriggerAddWatch(true)
  }

  const handleUpdateWatches = async (updater: (currentWatches: Watch[]) => Watch[]) => {
    if (!currentUser?.id) return
    
    const watchesKey = `watches_${currentUser.id}`
    
    try {
      const currentWatches = await window.spark.kv.get<Watch[]>(watchesKey) || []
      const updatedWatches = updater(currentWatches)
      const preparedWatches = await Promise.all(
        updatedWatches.map(async (watch) => {
          const sanitizedImageUrl = sanitizeWatchImageUrl(watch.imageUrl)

          if (!sanitizedImageUrl) {
            return {
              watchForStorage: { ...watch, imageUrl: undefined },
              watchForDisplay: { ...watch, imageUrl: undefined },
            }
          }

          if (sanitizedImageUrl.startsWith("data:image/")) {
            let imageForStorage = sanitizedImageUrl
            try {
              await window.spark.kv.set(getWatchPhotoKey(currentUser.id, watch.id), sanitizedImageUrl)
              imageForStorage = toWatchPhotoRef(watch.id)
            } catch (error) {
              console.error(`Error saving watch photo for ${watch.id}:`, error)
            }
            return {
              watchForStorage: { ...watch, imageUrl: imageForStorage },
              watchForDisplay: { ...watch, imageUrl: sanitizedImageUrl },
            }
          }

          return {
            watchForStorage: { ...watch, imageUrl: sanitizedImageUrl },
            watchForDisplay: { ...watch, imageUrl: sanitizedImageUrl },
          }
        })
      )
      const watchesForStorage = preparedWatches.map((watch) => watch.watchForStorage)
      const watchesForDisplay = preparedWatches.map((watch) => watch.watchForDisplay)
      
      console.log(`Saving ${watchesForStorage.length} watches to key: ${watchesKey}`)
      
      await window.spark.kv.set(watchesKey, watchesForStorage)
      setWatches(watchesForDisplay)
      console.log('Watches saved successfully')
    } catch (error) {
      console.error('Error saving watches:', error)
      throw error
    }
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
            currentUserId={currentUser?.id}
            vaultName={currentUser?.vaultName}
            preferredCurrency={preferredCurrency}
          />
        )
      case 'portfolio':
        return <PortfolioModule watches={watchList} preferredCurrency={preferredCurrency} />
      case 'market':
        return <MarketModule watches={watchList} preferredCurrency={preferredCurrency} />
      case 'ai-advisor':
        return <AIAdvisorModule watches={watchList} userId={currentUser?.id || ""} preferredCurrency={preferredCurrency} />
      case 'deals':
        return <DealsModule watches={watchList} userId={currentUser?.id || ""} preferredCurrency={preferredCurrency} />
      case 'appraisal':
        return <AppraisalModule watches={watchList} preferredCurrency={preferredCurrency} />
      case 'feedback':
        return isAdmin ? (
          <FeedbackDashboard />
        ) : (
          <CollectionModule
            watches={watchList}
            onUpdate={handleUpdateWatches}
            currentUserId={currentUser?.id}
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
            currentUserId={currentUser?.id}
            vaultName={currentUser?.vaultName}
            preferredCurrency={preferredCurrency}
          />
        )
      default:
        return (
          <CollectionModule
            watches={watchList}
            onUpdate={handleUpdateWatches}
            currentUserId={currentUser?.id}
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
            {renderModule()}
          </div>
        </main>
      </div>

      {isMobile && <MobileNav activeModule={activeModule} onModuleChange={setActiveModule} />}

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
