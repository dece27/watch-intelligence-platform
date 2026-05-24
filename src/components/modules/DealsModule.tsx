import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { Watch, Deal, DealsPreferences, UserPreferences } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Heart, MapPin, ArrowsClockwise } from "@phosphor-icons/react"
import { DealDetailModal } from "@/components/DealDetailModal"
import { DailyLimitError, callAI, createAICacheKey, hashAIInput, parseAIJson } from "@/lib/ai/caller"
import {
  areDealListingsConfigured,
  fetchDealListings,
} from "@/lib/deal-listings-client"
import { convertCurrency, formatCurrency, normalizeCurrency } from "@/lib/currency"
import { toast } from "sonner"

interface DealsModuleProps {
  watches: Watch[]
  userId: string
  preferredCurrency?: string
}

const DEFAULT_MAX_PRICE = 25000
const USER_PREFERENCES_PREFIX = "user_preferences_"
const PREFERENCES_PERSIST_DEBOUNCE_MS = 350
const AI_MATCH_BLEND_WEIGHT = 0.55
const HEURISTIC_MATCH_BLEND_WEIGHT = 1 - AI_MATCH_BLEND_WEIGHT
const DEFAULT_FALLBACK_DEAL_SCORE = 60
const DEAL_SCORE_DIVISOR = 2
const FALLBACK_QUERY_BRANDS = ["Rolex", "Omega"] as const
const MAX_BRANDS_TO_QUERY = 2
const TARGET_LIVE_DEAL_COUNT = 24

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ")

const toConditionLevel = (condition: string) => {
  const normalized = condition.trim().toLowerCase()
  if (normalized.includes("mint") || normalized.includes("new")) return 4
  if (normalized.includes("excellent")) return 3
  if (normalized.includes("very")) return 2
  if (normalized.includes("good")) return 1
  return 0
}

const formatDealPrice = (amount: number, currency = "USD", sourceCurrency = "USD") =>
  formatCurrency(amount, currency, { maximumFractionDigits: 0, sourceCurrency })

const scoreHeuristically = (deal: Deal, watches: Watch[], prefs: DealsPreferences): Deal => {
  const ownedBrands = new Set(watches.map((watch) => watch.brand.toLowerCase()))
  const preferredBrands = new Set(prefs.preferredBrands.map((brand) => brand.toLowerCase()))

  const brandBoost = preferredBrands.has(deal.brand.toLowerCase())
    ? 25
    : ownedBrands.has(deal.brand.toLowerCase())
      ? 15
      : 0
  const discountBoost = Math.min(25, Math.max(0, deal.discount))
  const ratingBoost = Math.round((deal.sellerRating || 0) * 6)
  const conditionBoost = toConditionLevel(deal.condition) * 5
  const boxBoost = prefs.requireBox ? (deal.hasBox ? 8 : -12) : deal.hasBox ? 3 : 0
  const papersBoost = prefs.requirePapers ? (deal.hasPapers ? 8 : -12) : deal.hasPapers ? 3 : 0
  const budgetPenalty = prefs.maxPrice > 0 && deal.price > prefs.maxPrice ? -20 : 0

  const matchScore = Math.max(
    0,
    Math.min(100, brandBoost + discountBoost + ratingBoost + conditionBoost + boxBoost + papersBoost + budgetPenalty)
  )
  const dealScore = Math.max(0, Math.min(100, Math.round((matchScore + discountBoost + ratingBoost) / DEAL_SCORE_DIVISOR)))

  return {
    ...deal,
    matchScore,
    dealScore,
  }
}

const getDefaultPreferences = (watches: Watch[]): DealsPreferences => {
  const topBrands = Array.from(new Set(watches.map((watch) => watch.brand))).slice(0, 4)
  return {
    preferredBrands: topBrands,
    selectedBrand: "all",
    condition: "all",
    maxPrice: DEFAULT_MAX_PRICE,
    minDiscount: 5,
    minSellerRating: 4,
    requireBox: false,
    requirePapers: false,
    aiOnlyTop: true,
    sortBy: "ai-match",
  }
}

const getPreferencesKey = (userId: string) => `${USER_PREFERENCES_PREFIX}${userId}`
const roundToTwoDecimals = (value: number) => Math.round(value * 100) / 100

const parseAiRanking = (
  rawResponse: string,
  scoredDeals: Deal[]
): Map<string, { matchScore: number; reasoning: string }> => {
  const rankingMap = new Map<string, { matchScore: number; reasoning: string }>()

  try {
    const parsed = parseAIJson<Array<Record<string, unknown>>>(rawResponse)
    if (!Array.isArray(parsed)) return rankingMap

    const validIds = new Set(scoredDeals.map((deal) => deal.id))
    for (const row of parsed) {
      const id = typeof row.id === "string" ? row.id : ""
      const matchScore = typeof row.matchScore === "number" ? row.matchScore : NaN
      const reasoning = typeof row.reasoning === "string" ? row.reasoning.trim() : ""
      if (!id || !validIds.has(id) || !Number.isFinite(matchScore)) continue

      rankingMap.set(id, {
        matchScore: Math.max(0, Math.min(100, Math.round(matchScore))),
        reasoning: reasoning || "Ranked highly for portfolio fit.",
      })
    }
  } catch (error) {
    console.error("[DealsModule] Failed to parse AI ranking response.", error)
    return rankingMap
  }

  return rankingMap
}

export function DealsModule({ watches, userId, preferredCurrency = "USD" }: DealsModuleProps) {
  const [deals, setDeals] = useState<Deal[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLiveData, setIsLiveData] = useState(false)
  const [favorites, setFavorites] = useState<string[]>([])
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [preferences, setPreferences] = useState<DealsPreferences>(() => getDefaultPreferences(watches))
  const previousCurrencyRef = useRef(normalizeCurrency(preferredCurrency))

  const availableBrands = useMemo(() => {
    const dealBrands = deals.map((deal) => deal.brand)
    const watchBrands = watches.map((watch) => watch.brand)
    return Array.from(new Set([...dealBrands, ...watchBrands])).sort((a, b) => a.localeCompare(b))
  }, [deals, watches])

  useEffect(() => {
    let active = true

    const loadPreferences = async () => {
      const defaults = getDefaultPreferences(watches)
      try {
        const stored = await window.spark.kv.get<UserPreferences>(getPreferencesKey(userId))
        if (!active) return

        if (stored?.deals) {
          setPreferences({
            ...defaults,
            ...stored.deals,
            preferredBrands: stored.deals.preferredBrands?.length
              ? stored.deals.preferredBrands
              : defaults.preferredBrands,
          })
        } else {
          setPreferences(defaults)
        }
      } catch (error) {
        if (!active) return
        console.error("[DealsModule] Failed to load stored deal preferences.", error)
        setPreferences(defaults)
      } finally {
        if (active) setPreferencesLoaded(true)
      }
    }

    loadPreferences()
    return () => {
      active = false
    }
  }, [userId, watches])

  useEffect(() => {
    if (!preferencesLoaded) return

    const timeout = window.setTimeout(async () => {
      try {
        const key = getPreferencesKey(userId)
        const existing = await window.spark.kv.get<UserPreferences>(key)
        await window.spark.kv.set(key, {
          ...(existing || {}),
          userId,
          deals: preferences,
          updatedAt: new Date().toISOString(),
        } satisfies UserPreferences)
      } catch (error) {
        console.error("[DealsModule] Failed to persist deal preferences.", error)
      }
    }, PREFERENCES_PERSIST_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [preferences, preferencesLoaded, userId])

  useEffect(() => {
    const currentCurrency = normalizeCurrency(preferredCurrency)
    const previousCurrency = previousCurrencyRef.current
    if (currentCurrency === previousCurrency) return

    setPreferences((current) => ({
      ...current,
      maxPrice: Math.max(0, roundToTwoDecimals(convertCurrency(current.maxPrice, previousCurrency, currentCurrency))),
    }))
    previousCurrencyRef.current = currentCurrency
  }, [preferredCurrency])

  const toPreferredCurrencyAmount = useCallback((amount: number, sourceCurrency?: string) => {
    return convertCurrency(amount, sourceCurrency || "USD", preferredCurrency)
  }, [preferredCurrency])

  const fetchDeals = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    if (!areDealListingsConfigured) {
      setDeals([])
      setIsLiveData(false)
      setErrorMessage("Supabase deal listings are not configured.")
      setIsLoading(false)
      return
    }

    try {
      const portfolioBrands = Array.from(new Set(watches.map((watch) => watch.brand)))
      const brandsToQuery = (preferences.preferredBrands.length > 0 ? preferences.preferredBrands : portfolioBrands)
        .slice(0, MAX_BRANDS_TO_QUERY)

      const queryTargets = brandsToQuery.length > 0 ? brandsToQuery : [...FALLBACK_QUERY_BRANDS]
      const uniqueDeals = await fetchDealListings({
        brands: queryTargets,
        maxPrice: preferences.maxPrice > 0 ? preferences.maxPrice : undefined,
        limit: TARGET_LIVE_DEAL_COUNT,
      })

      if (uniqueDeals.length === 0) {
        throw new Error("No synced deal listings are available yet.")
      }

      const heuristicScored = uniqueDeals.map((deal) => scoreHeuristically(deal, watches, preferences))

      const rankingPrompt = `You are a luxury watch deal-ranking model.
Rank these deals for the user portfolio and preferences.

Portfolio watches:
${JSON.stringify(
  watches.map((watch) => ({
    brand: watch.brand,
    model: watch.model,
    referenceNumber: watch.referenceNumber || null,
    category: watch.category,
    purchasePrice: watch.purchasePrice,
  }))
)}

User preferences:
${JSON.stringify(preferences)}

Deals:
${JSON.stringify(
  heuristicScored.map((deal) => ({
    id: deal.id,
    brand: deal.brand,
    model: deal.model,
    referenceNumber: deal.referenceNumber || null,
    price: deal.price,
    discount: deal.discount,
    condition: deal.condition,
    sellerRating: deal.sellerRating || null,
    hasBox: deal.hasBox || false,
    hasPapers: deal.hasPapers || false,
    heuristicMatchScore: deal.matchScore,
  }))
)}

Respond ONLY as JSON array with this shape:
[{"id":"deal-id","matchScore":0-100,"reasoning":"short reason"}]
Return every deal id exactly once.`

      let scoredDeals = heuristicScored
      try {
        const aiResponse = await callAI({
          prompt: rankingPrompt,
          jsonMode: true,
          taskType: 'deal_ranking',
          cacheKey: createAICacheKey(
            'deal-ranking',
            userId || 'anonymous',
            hashAIInput(JSON.stringify({
              preferredCurrency,
              preferences,
              watches: watches.map((watch) => ({
                id: watch.id,
                brand: watch.brand,
                model: watch.model,
                category: watch.category,
                purchasePrice: watch.purchasePrice,
              })),
              deals: heuristicScored.map((deal) => ({
                id: deal.id,
                brand: deal.brand,
                model: deal.model,
                price: deal.price,
                discount: deal.discount,
                condition: deal.condition,
                sellerRating: deal.sellerRating || null,
              })),
            })),
          ),
          cacheTtlSeconds: 60 * 30,
        })
        const rankingMap = parseAiRanking(aiResponse, heuristicScored)

        if (rankingMap.size > 0) {
          scoredDeals = heuristicScored.map((deal) => {
            const ranked = rankingMap.get(deal.id)
            if (!ranked) return deal

            const blendedScore = Math.round(
              ((deal.matchScore * HEURISTIC_MATCH_BLEND_WEIGHT) + (ranked.matchScore * AI_MATCH_BLEND_WEIGHT))
            )
            return {
              ...deal,
              matchScore: Math.max(0, Math.min(100, blendedScore)),
              aiReasoning: ranked.reasoning,
              dealScore: Math.max(
                0,
                Math.min(100, Math.round(((deal.dealScore || DEFAULT_FALLBACK_DEAL_SCORE) + blendedScore) / 2))
              ),
            }
          })
        }
      } catch (error) {
        if (error instanceof DailyLimitError) {
          toast.info('Daily AI match quota reached. Showing heuristic ranking instead.')
        } else {
          console.error("[DealsModule] AI ranking request failed; using heuristic ranking.", error)
        }
        // AI ranking is optional; heuristic ranking remains.
      }

      setDeals(scoredDeals)
      setIsLiveData(true)
    } catch (error) {
      setDeals([])
      setIsLiveData(false)
      setErrorMessage(error instanceof Error ? error.message : "Deal listings unavailable")
    } finally {
      setIsLoading(false)
    }
  }, [preferences, preferredCurrency, userId, watches])

  useEffect(() => {
    if (!preferencesLoaded) return
    fetchDeals()
  }, [preferencesLoaded, fetchDeals])

  const filteredDeals = useMemo(() => {
    const filtered = deals.filter((deal) => {
      if (preferences.selectedBrand !== "all" && deal.brand !== preferences.selectedBrand) return false
      if (preferences.condition !== "all" && toTitleCase(deal.condition) !== preferences.condition) return false
      if (preferences.maxPrice > 0 && toPreferredCurrencyAmount(deal.price, deal.currency) > preferences.maxPrice) return false
      if (deal.discount < preferences.minDiscount) return false
      if ((deal.sellerRating || 0) < preferences.minSellerRating) return false
      if (preferences.requireBox && !deal.hasBox) return false
      if (preferences.requirePapers && !deal.hasPapers) return false
      if (preferences.aiOnlyTop && deal.matchScore < 75) return false
      return true
    })

    const sorted = [...filtered]
    if (preferences.sortBy === "discount") sorted.sort((a, b) => b.discount - a.discount)
    if (preferences.sortBy === "price-asc") {
      sorted.sort((a, b) => toPreferredCurrencyAmount(a.price, a.currency) - toPreferredCurrencyAmount(b.price, b.currency))
    }
    if (preferences.sortBy === "price-desc") {
      sorted.sort((a, b) => toPreferredCurrencyAmount(b.price, b.currency) - toPreferredCurrencyAmount(a.price, a.currency))
    }
    if (preferences.sortBy === "newest") {
      sorted.sort((a, b) => {
        const dateA = a.listedAt ? new Date(a.listedAt).getTime() : 0
        const dateB = b.listedAt ? new Date(b.listedAt).getTime() : 0
        return dateB - dateA
      })
    }
    if (preferences.sortBy === "ai-match") sorted.sort((a, b) => b.matchScore - a.matchScore)

    return sorted
  }, [deals, preferences, toPreferredCurrencyAmount])

  const updatePreference = <K extends keyof DealsPreferences>(key: K, value: DealsPreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }))
  }

  const togglePreferredBrand = (brand: string) => {
    setPreferences((current) => {
      const normalized = current.preferredBrands.includes(brand)
        ? current.preferredBrands.filter((entry) => entry !== brand)
        : [...current.preferredBrands, brand]

      return {
        ...current,
        preferredBrands: normalized,
      }
    })
  }

  const handleResetPreferences = () => {
    setPreferences(getDefaultPreferences(watches))
  }

  const handleRefresh = () => {
    fetchDeals()
  }

  const toggleFavorite = (id: string, event: MouseEvent) => {
    event.stopPropagation()
    setFavorites((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))
  }

  const handleViewDetails = (deal: Deal) => {
    setSelectedDeal(deal)
    setIsModalOpen(true)
  }

  const handleFilterBrand = (brand: string) => {
    updatePreference("selectedBrand", brand)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Deal Flow</h1>
          <p className="text-muted-foreground mt-1">Synced marketplace listings filtered to your portfolio and AI preferences</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={isLiveData ? "border-success/40 text-success" : ""}>
            {isLiveData ? "Live Deal Listings" : "Live Data Unavailable"}
          </Badge>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <ArrowsClockwise className="mr-2" size={16} />
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {errorMessage && (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="py-3 text-sm text-amber-200">
            Synced deal listings unavailable: {errorMessage}
          </CardContent>
        </Card>
      )}

      <Card className="bg-white/[0.02] border-white/[0.08]">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">User Preferences & Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Brand</Label>
              <Select value={preferences.selectedBrand} onValueChange={(value) => updatePreference("selectedBrand", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {availableBrands.map((brand) => (
                    <SelectItem key={brand} value={brand}>
                      {brand}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={preferences.condition} onValueChange={(value) => updatePreference("condition", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All conditions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Conditions</SelectItem>
                  <SelectItem value="Mint">Mint</SelectItem>
                  <SelectItem value="Excellent">Excellent</SelectItem>
                  <SelectItem value="Very Good">Very Good</SelectItem>
                  <SelectItem value="Good">Good</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Max Price ({preferredCurrency})</Label>
              <Input
                type="number"
                min={0}
                value={preferences.maxPrice}
                onChange={(event) => updatePreference("maxPrice", Math.max(0, Number(event.target.value || 0)))}
              />
            </div>

            <div className="space-y-2">
              <Label>Sort By</Label>
              <Select value={preferences.sortBy} onValueChange={(value) => updatePreference("sortBy", value as DealsPreferences["sortBy"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai-match">AI Match</SelectItem>
                  <SelectItem value="discount">Highest Discount</SelectItem>
                  <SelectItem value="price-asc">Lowest Price</SelectItem>
                  <SelectItem value="price-desc">Highest Price</SelectItem>
                  <SelectItem value="newest">Newest Listings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Minimum Discount %</Label>
              <Input
                type="number"
                min={0}
                max={99}
                value={preferences.minDiscount}
                onChange={(event) => updatePreference("minDiscount", Math.max(0, Number(event.target.value || 0)))}
              />
            </div>
            <div className="space-y-2">
              <Label>Minimum Seller Rating</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                max={5}
                value={preferences.minSellerRating}
                onChange={(event) =>
                  updatePreference("minSellerRating", Math.min(5, Math.max(0, Number(event.target.value || 0))))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/[0.08] px-3 py-2">
              <Label htmlFor="require-box" className="text-sm">Require Box</Label>
              <Switch
                id="require-box"
                checked={preferences.requireBox}
                onCheckedChange={(checked) => updatePreference("requireBox", checked)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/[0.08] px-3 py-2">
              <Label htmlFor="require-papers" className="text-sm">Require Papers</Label>
              <Switch
                id="require-papers"
                checked={preferences.requirePapers}
                onCheckedChange={(checked) => updatePreference("requirePapers", checked)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/[0.08] px-3 py-2">
            <Label htmlFor="ai-top-only" className="text-sm">AI top results only (match score ≥ 75)</Label>
            <Switch
              id="ai-top-only"
              checked={preferences.aiOnlyTop}
              onCheckedChange={(checked) => updatePreference("aiOnlyTop", checked)}
            />
          </div>

          <div className="space-y-2">
            <Label>Preferred Brands (stored in User Preferences)</Label>
            <div className="flex flex-wrap gap-2">
              {availableBrands.map((brand) => {
                const isActive = preferences.preferredBrands.includes(brand)
                return (
                  <Button
                    key={brand}
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    onClick={() => togglePreferredBrand(brand)}
                    className="h-8"
                  >
                    {brand}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={handleResetPreferences}>
              Reset Preferences
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDeals.map((deal) => (
          <Card
            key={deal.id}
            className="bg-white/[0.025] border-white/[0.07] hover:bg-white/[0.035] transition-all duration-200 cursor-pointer"
            onClick={() => handleViewDetails(deal)}
          >
            <CardHeader className="pb-3">
              <div className="relative">
                <div className="w-full h-48 bg-muted/20 rounded-lg mb-3 overflow-hidden">
                  <img
                    src={deal.imageUrl}
                    alt={`${deal.brand} ${deal.model}`}
                    className="w-full h-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23333' width='200' height='200'/%3E%3Ctext fill='%23666' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3ENo Image%3C/text%3E%3C/svg%3E"
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70"
                  onClick={(event) => toggleFavorite(deal.id, event)}
                >
                  <Heart
                    size={20}
                    weight={favorites.includes(deal.id) ? "fill" : "regular"}
                    className={favorites.includes(deal.id) ? "text-primary" : "text-white"}
                  />
                </Button>
                <Badge className="absolute top-2 left-2 bg-success text-success-foreground">
                  {deal.discount}% Below Market
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xl">{deal.brand}</CardTitle>
                {deal.source && <Badge variant="outline">{deal.source}</Badge>}
              </div>
              <p className="text-muted-foreground">{deal.model}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-baseline">
                <div>
                  <div className="text-sm text-muted-foreground">Price</div>
                  <div className="text-2xl font-semibold text-primary">{formatDealPrice(deal.price, preferredCurrency, deal.currency)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Market</div>
                  <div className="text-lg font-medium line-through text-muted-foreground">
                    {formatDealPrice(deal.marketValue || deal.fairValue || deal.price, preferredCurrency, deal.currency)}
                  </div>
                </div>
              </div>

              <div className="flex justify-between text-sm pt-2 border-t border-white/[0.05]">
                <span className="text-muted-foreground">Condition</span>
                <span className="font-medium">{deal.condition}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">AI Match</span>
                <Badge variant="outline" className="tabular-nums">
                  {deal.matchScore}% Match
                </Badge>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Seller Rating</span>
                <span className="font-medium">{deal.sellerRating ? deal.sellerRating.toFixed(1) : "N/A"}</span>
              </div>

              {deal.aiReasoning && (
                <p className="text-xs text-muted-foreground border-l border-white/[0.12] pl-3">
                  {deal.aiReasoning}
                </p>
              )}

              <div className="flex items-center gap-1 text-sm text-muted-foreground pt-2">
                <MapPin size={14} />
                <span>{deal.location}</span>
              </div>

              <div className="text-xs text-muted-foreground">via {deal.seller}</div>

              <Button
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground mt-3"
                onClick={(event) => {
                  event.stopPropagation()
                  handleViewDetails(deal)
                }}
              >
                View Details
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLoading && filteredDeals.length === 0 && (
        <Card className="bg-white/[0.02] border-white/[0.08]">
          <CardContent className="py-10 text-center text-muted-foreground">
            No deals match your current filters. Adjust User Preferences to broaden results.
          </CardContent>
        </Card>
      )}

      {selectedDeal && (
        <DealDetailModal
          deal={selectedDeal}
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          onFilterBrand={handleFilterBrand}
          preferredCurrency={preferredCurrency}
        />
      )}
    </div>
  )
}
