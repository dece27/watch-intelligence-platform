import { useState, useEffect } from "react"
import { useKV } from "@github/spark/hooks"
import { Watch, MarketSignal, ChatMessage, Deal, UserPreferences, VaultMetadata } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sparkle, PaperPlaneTilt, Image as ImageIcon, Plus, Fire, Star, ShoppingCart, TrendUp, TrendDown, FileArrowUp } from "@phosphor-icons/react"
import { toast } from "sonner"
import { callTrackedLlm } from "@/lib/adminAnalytics"
import { searchChrono24Deals } from "@/lib/chrono24-client"
import { formatCurrency } from "@/lib/currency"
import { FALLBACK_DEALS } from "@/lib/fallback-deals"

interface AIAdvisorModuleProps {
  watches: Watch[]
  userId: string
  preferredCurrency?: string
}

interface RebalanceAnalysis {
  concentrationRisk: string
  sell: string
  buy: string
  strategicScore: {
    score: number
    explanation: string
  }
}

const DEFAULT_STRATEGIC_SCORE = 5
const DEFAULT_NO_SELL_ACTION = 'No sell action needed — nothing should be done.'
const DEFAULT_NO_BUY_ACTION = 'No buy action needed — nothing should be done.'
const DEAL_OF_DAY_QUERY_LIMIT = 20
const MAX_DEAL_OF_DAY_BRANDS = 4
const DEAL_OF_DAY_FALLBACK_BRANDS = ["Rolex", "Omega", "Patek Philippe", "Audemars Piguet"]
const IDENTIFIER_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const IDENTIFIER_MAX_DIMENSION = 800
const IDENTIFIER_MAX_OUTPUT_KB = 500
const IDENTIFIER_COMPRESSION_QUALITY = 0.75
const IDENTIFIER_ALLOWED_DATA_URL_PATTERN = /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,[a-z0-9+/]+=*$/i
const USER_PREFERENCES_PREFIX = "user_preferences_"
const VAULT_METADATA_PREFIX = "vaultMetadata_"
const AI_SIGNAL_ENGINE_CACHE_PREFIX = "ai_signal_engine_cache_"

interface AiSignalEngineCache {
  dependencyHash: string
  signals?: MarketSignal[]
  rebalanceAnalysis?: RebalanceAnalysis
  dealAssessments?: Record<string, string>
  updatedAt: string
}

const getUserPreferencesKey = (userId: string) => `${USER_PREFERENCES_PREFIX}${userId}`
const getVaultMetadataKey = (userId: string) => `${VAULT_METADATA_PREFIX}${userId}`
const getAiSignalEngineCacheKey = (userId: string) => `${AI_SIGNAL_ENGINE_CACHE_PREFIX}${userId || "anonymous"}`

const getNormalizedWatchesForDependency = (watches: Watch[]) =>
  [...watches]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((watch) => ({
      id: watch.id,
      brand: watch.brand,
      model: watch.model,
      referenceNumber: watch.referenceNumber || "",
      year: watch.year || null,
      purchasePrice: watch.purchasePrice,
      currentValue: watch.currentValue || watch.purchasePrice,
      condition: watch.condition,
      category: watch.category,
      hasBox: watch.hasBox ?? null,
      hasPapers: watch.hasPapers ?? null,
    }))

const getDependencyHash = (
  watches: Watch[],
  preferences: UserPreferences | null,
  vaultMetadata: VaultMetadata | null
) => {
  const derivedTotalValue = watches.reduce((sum, watch) => sum + (watch.currentValue || watch.purchasePrice), 0)
  return JSON.stringify({
    watches: getNormalizedWatchesForDependency(watches),
    dealsPreferences: preferences?.deals || null,
    vault: {
      watchCount: watches.length,
      totalValue: derivedTotalValue,
      vaultName: vaultMetadata?.vaultName || "",
      metadataWatchCount: vaultMetadata?.watchCount ?? null,
      metadataTotalValue: vaultMetadata?.totalValue ?? null,
    },
  })
}

const extractJsonPayload = (response: string) => {
  const trimmed = response.trim()
  const fenced = trimmed.match(/```(?:[a-z0-9_-]+)?\s*([\s\S]*?)\s*```/i)
  return fenced ? fenced[1].trim() : trimmed
}

const pickStringValue = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return ''
}

const normalizeRecommendation = (value: string, fallback: string) => {
  const trimmed = value.trim()
  if (!trimmed) return fallback

  const noActionPattern = /\b(no action|do nothing|nothing should be done|no changes?|none needed|not needed)\b/i
  if (noActionPattern.test(trimmed)) {
    return fallback
  }

  return trimmed
}

const parseRebalanceAnalysis = (response: string): RebalanceAnalysis => {
  try {
    const parsed = JSON.parse(extractJsonPayload(response)) as Record<string, unknown>
    const strategicScore = (parsed.strategicScore || parsed.strategic_score || {}) as Record<string, unknown>
    const parsedScore = Number(strategicScore.score)

    return {
      concentrationRisk: pickStringValue(parsed, ['concentrationRisk', 'concentration_risk', 'concentration risk']),
      sell: normalizeRecommendation(
        pickStringValue(parsed, ['sell', 'sellRecommendation', 'sell_recommendation', 'sell recommendation']),
        DEFAULT_NO_SELL_ACTION
      ),
      buy: normalizeRecommendation(
        pickStringValue(parsed, ['buy', 'buyRecommendation', 'buy_recommendation', 'buy recommendation']),
        DEFAULT_NO_BUY_ACTION
      ),
      strategicScore: {
        score: Number.isFinite(parsedScore) ? parsedScore : DEFAULT_STRATEGIC_SCORE,
        explanation: pickStringValue(strategicScore, ['explanation', 'reasoning']) || 'No explanation provided.'
      }
    }
  } catch (error) {
    throw new Error(`Malformed rebalancing analysis response: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const getSafeIdentifierImageSource = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (IDENTIFIER_ALLOWED_DATA_URL_PATTERN.test(trimmed)) {
    return trimmed
  }

  try {
    const parsedUrl = new URL(trimmed)
    return parsedUrl.protocol === 'https:' ? parsedUrl.href : ''
  } catch {
    return ''
  }
}

const STARTER_QUESTIONS = [
  "What should I add to diversify my collection?",
  "Which of my watches has the best investment potential?",
  "How does my portfolio compare to typical collectors?",
  "Should I sell any watches in my collection?"
]

export function AIAdvisorModule({ watches, userId, preferredCurrency = "USD" }: AIAdvisorModuleProps) {
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [signals, setSignals] = useState<MarketSignal[]>([])
  const [isLoadingSignals, setIsLoadingSignals] = useState(false)
  const [identifierImage, setIdentifierImage] = useState('')
  const [isIdentifying, setIsIdentifying] = useState(false)
  const [identifiedWatch, setIdentifiedWatch] = useState<any>(null)
  const [rebalanceAnalysis, setRebalanceAnalysis] = useState<RebalanceAnalysis | null>(null)
  const [isLoadingRebalance, setIsLoadingRebalance] = useState(false)
  const [dealOfDay, setDealOfDay] = useState<Deal | null>(null)
  const [dealAssessment, setDealAssessment] = useState<string>('')
  const [isLoadingDeal, setIsLoadingDeal] = useState(false)
  const [mockListings, setMockListings] = useKV<Deal[]>("mockListings", [])
  const [isLiveDealData, setIsLiveDealData] = useState(false)
  const safeIdentifierImage = getSafeIdentifierImageSource(identifierImage)
  const identifierInputValue = IDENTIFIER_ALLOWED_DATA_URL_PATTERN.test(identifierImage) ? '' : identifierImage
  const identifierPreviewImage = IDENTIFIER_ALLOWED_DATA_URL_PATTERN.test(safeIdentifierImage) ? safeIdentifierImage : ''

  const getAiCacheContext = async () => {
    const cacheKey = getAiSignalEngineCacheKey(userId)
    try {
      const [preferences, vaultMetadata, cache] = await Promise.all([
        userId ? window.spark.kv.get<UserPreferences>(getUserPreferencesKey(userId)) : Promise.resolve(null),
        userId ? window.spark.kv.get<VaultMetadata>(getVaultMetadataKey(userId)) : Promise.resolve(null),
        window.spark.kv.get<AiSignalEngineCache>(cacheKey),
      ])

      return {
        cacheKey,
        dependencyHash: getDependencyHash(watches, preferences ?? null, vaultMetadata ?? null),
        cache,
      }
    } catch {
      return {
        cacheKey,
        dependencyHash: getDependencyHash(watches, null, null),
        cache: null,
      }
    }
  }

  const saveAiCache = async (
    cacheKey: string,
    dependencyHash: string,
    updates: Partial<AiSignalEngineCache>,
    existingCache?: AiSignalEngineCache | null
  ) => {
    try {
      await window.spark.kv.set(cacheKey, {
        ...(existingCache || {}),
        ...updates,
        dependencyHash,
        updatedAt: new Date().toISOString(),
      } satisfies AiSignalEngineCache)
    } catch {
      // Silent cache write failure; module remains functional.
    }
  }

  useEffect(() => {
    if (watches.length > 0 && signals.length === 0) {
      generateSignals()
    }
  }, [watches])

  useEffect(() => {
    // Load (or reload) the Deal of the Day whenever the watch portfolio changes.
    // The function always attempts live data and falls back to cached or static
    // deals, so we no longer need to gate on `hasChrono24Credentials`.
    // `mockListings` is intentionally excluded from the dependency array:
    // loadDealOfDay() itself writes to mockListings when it fetches live data,
    // so including it here would cause an infinite update loop.
    loadDealOfDay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watches])

  const generateSignals = async () => {
    if (watches.length === 0) return
    
    setIsLoadingSignals(true)
    try {
      const { cacheKey, dependencyHash, cache } = await getAiCacheContext()
      if (cache?.dependencyHash === dependencyHash && cache.signals?.length) {
        setSignals(cache.signals)
        return
      }

      const signalsPromises = watches.slice(0, 5).map(async (watch) => {
        const promptText = `You are a luxury watch investment advisor. Analyze this watch and provide a trading signal.

Watch: ${watch.brand} ${watch.model}
Purchase Price: ${formatCurrency(watch.purchasePrice, preferredCurrency)}
Current Estimated Value: ${formatCurrency(watch.currentValue || watch.purchasePrice, preferredCurrency)}
Condition: ${watch.condition}
Year: ${watch.year || 'Unknown'}

Provide a BUY, HOLD, or SELL signal with:
1. A 2-sentence reasoning explaining your recommendation
2. Confidence level (high, medium, or low)

Respond in valid JSON format:
{
  "signal": "buy|hold|sell",
  "reasoning": "Your 2-sentence explanation here",
  "confidence": "high|medium|low"
}`

        try {
          const response = await callTrackedLlm(promptText, 'gpt-4o-mini', true)
          const parsed = JSON.parse(response)
          
          return {
            type: parsed.signal as 'buy' | 'hold' | 'sell',
            title: `${watch.brand} ${watch.model}`,
            reasoning: parsed.reasoning,
            confidence: parsed.confidence as 'high' | 'medium' | 'low',
            watchId: watch.id
          }
        } catch {
          return {
            type: 'hold' as const,
            title: `${watch.brand} ${watch.model}`,
            reasoning: "Unable to generate signal at this time. Monitor market conditions and reassess.",
            confidence: 'medium' as const,
            watchId: watch.id
          }
        }
      })

      const generatedSignals = await Promise.all(signalsPromises)
      setSignals(generatedSignals)
      await saveAiCache(cacheKey, dependencyHash, { signals: generatedSignals }, cache)
    } catch (error) {
      toast.error("Failed to generate signals")
    } finally {
      setIsLoadingSignals(false)
    }
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return

    const userMessage = chatInput
    setChatInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      const collectionSummary = watches.map(w => `${w.brand} ${w.model} (${w.year || 'N/A'}, ${formatCurrency(w.purchasePrice, preferredCurrency)})`).join(', ')
      
      const promptText = `You are an expert luxury watch investment advisor with deep knowledge of horology, market trends, and collecting strategies.

The user has a collection of ${watches.length} watches${watches.length > 0 ? `: ${collectionSummary}` : '.'}

User question: ${userMessage}

Provide expert, concise advice (2-3 paragraphs max) about their collection, watch market trends, or collecting strategy. Be specific and reference their actual watches when relevant. Focus on actionable insights.`

      const response = await callTrackedLlm(promptText, 'gpt-4o-mini')
      
      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } catch (error) {
      toast.error('Failed to get AI response')
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleStarterQuestion = (question: string) => {
    setChatInput(question)
  }

  const handleIdentifierFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file")
      return
    }

    if (file.size > IDENTIFIER_MAX_UPLOAD_BYTES) {
      toast.error("Image must be less than 10MB")
      return
    }

    const reader = new FileReader()
    reader.onload = (readerEvent) => {
      const dataUrl = readerEvent.target?.result
      if (typeof dataUrl !== 'string') {
        toast.error("Failed to read image file")
        return
      }

      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        if (width > height && width > IDENTIFIER_MAX_DIMENSION) {
          height = (height * IDENTIFIER_MAX_DIMENSION) / width
          width = IDENTIFIER_MAX_DIMENSION
        } else if (height > IDENTIFIER_MAX_DIMENSION) {
          width = (width * IDENTIFIER_MAX_DIMENSION) / height
          height = IDENTIFIER_MAX_DIMENSION
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          toast.error("Unable to create canvas context for image processing")
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

        const compressedDataUrl = canvas.toDataURL('image/jpeg', IDENTIFIER_COMPRESSION_QUALITY)
        const base64Payload = compressedDataUrl.split(',')[1] || ''
        // base64 stores 3 bytes in 4 chars, so this approximates original byte size.
        const sizeInKB = Math.round((base64Payload.length * 3) / 4 / 1024)

        if (sizeInKB > IDENTIFIER_MAX_OUTPUT_KB) {
          toast.error(`Image too large (${sizeInKB}KB). Please use a smaller photo.`)
          return
        }

        setIdentifierImage(compressedDataUrl)
        toast.success(`Photo uploaded (${sizeInKB}KB)`)
      }

      img.onerror = () => {
        toast.error("Failed to process image")
      }

      img.src = dataUrl
    }

    reader.onerror = () => {
      toast.error("Failed to read image file")
    }

    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const handleIdentifyWatch = async () => {
    if (!safeIdentifierImage) {
      toast.error("Please upload a photo or enter an image URL")
      return
    }

    setIsIdentifying(true)
    try {
      const promptText = `You are a luxury watch expert. Analyze this watch image and identify it.

Image source (URL or base64-encoded photo): ${safeIdentifierImage}

Based on the image, identify:
- Brand
- Model name
- Reference number (if visible)
- Estimated current market value in USD
- Key identifying features

Respond in valid JSON format:
{
  "brand": "Brand name",
  "model": "Model name",
  "reference": "Reference number or 'Unknown'",
  "value": estimated value as a number,
  "features": "2-3 sentences describing key identifying features"
}`

      const response = await callTrackedLlm(promptText, 'gpt-4o-mini', true)
      const parsed = JSON.parse(response)
      
      setIdentifiedWatch({
        ...parsed,
        imageUrl: safeIdentifierImage
      })
    } catch (error) {
      toast.error("Failed to identify watch")
      setIdentifiedWatch({
        brand: "Luxury Watch",
        model: "Model Unknown",
        reference: "Unknown",
        value: 0,
        features: "Unable to identify from this image. Please try a clearer photo showing the dial and case details.",
        imageUrl: safeIdentifierImage
      })
    } finally {
      setIsIdentifying(false)
    }
  }

  const handleAddToCollection = () => {
    toast.success("Watch identification saved! Add it to your collection from the Collection module.")
    setIdentifiedWatch(null)
    setIdentifierImage('')
  }

  const loadDealOfDay = async () => {
    setIsLoadingDeal(true)
    try {
      let listings: Deal[] = []
      let usedLiveData = false

      // Always attempt live data from Chrono24 regardless of whether a wrapper
      // is configured – errors are caught per-brand and the module falls back.
      const portfolioBrands = Array.from(new Set(watches.map((watch) => watch.brand))).slice(0, MAX_DEAL_OF_DAY_BRANDS)
      const queryTargets = portfolioBrands.length > 0 ? portfolioBrands : DEAL_OF_DAY_FALLBACK_BRANDS
      const uniqueDealsMap = new Map<string, Deal>()

      for (const brand of queryTargets) {
        try {
          const brandDeals = await searchChrono24Deals({
            brand,
            page: 1,
            limit: DEAL_OF_DAY_QUERY_LIMIT,
          })

          for (const deal of brandDeals) {
            uniqueDealsMap.set(deal.id, deal)
          }

          if (uniqueDealsMap.size >= DEAL_OF_DAY_QUERY_LIMIT) {
            break
          }
        } catch {
          // Keep iterating through the remaining brands before falling back.
        }
      }

      listings = Array.from(uniqueDealsMap.values())

      if (listings.length > 0) {
        // Cache the live results for next time
        setMockListings(listings)
        usedLiveData = true
      } else if (mockListings && mockListings.length > 0) {
        // Use previously cached live results
        listings = mockListings
      } else {
        // Last resort: use the static fallback deals so the section is never blank.
        // These are clearly labelled as fallback data in the UI badge.
        listings = FALLBACK_DEALS
      }

      setIsLiveDealData(usedLiveData)

      // Score every listing: higher discount from fair value + seller rating wins.
      const listingsWithScores = listings.map(l => {
        const fairVal = l.fairValue || l.marketValue || l.price
        const dealScore = Math.max(0, Math.min(100, Math.round(
          100 - ((l.price / fairVal) * 100) +
          ((l.sellerRating || 0) * 5) -
          ((l.daysListed || 0) * 0.5)
        )))
        return { ...l, dealScore, fairValue: fairVal }
      })

      listingsWithScores.sort((a, b) => b.dealScore - a.dealScore)
      const topDeal = listingsWithScores[0]
      setDealOfDay(topDeal)

      const { cacheKey, dependencyHash, cache } = await getAiCacheContext()
      const cachedAssessment = cache?.dependencyHash === dependencyHash ? cache.dealAssessments?.[topDeal.id] : undefined
      if (cachedAssessment) {
        setDealAssessment(cachedAssessment)
        return
      }

      const assessmentPrompt = `In exactly 2 sentences, explain why this watch is today's best deal: ${topDeal.brand} ${topDeal.model} ${topDeal.referenceNumber || ''}, ${topDeal.year || 'unknown year'}, ${topDeal.condition}, asking ${formatCurrency(topDeal.price, preferredCurrency)} vs fair market value of ${formatCurrency(topDeal.fairValue || topDeal.price, preferredCurrency)}. Be specific about what makes the price attractive and who should consider buying it.`


      const assessment = await callTrackedLlm(assessmentPrompt, 'gpt-4o-mini')
      setDealAssessment(assessment)
      await saveAiCache(cacheKey, dependencyHash, {
        dealAssessments: {
          ...(cache?.dealAssessments || {}),
          [topDeal.id]: assessment,
        },
      }, cache)
    } catch (error) {
      console.error("Failed to load deal of day:", error)
      setIsLiveDealData(false)
    } finally {
      setIsLoadingDeal(false)
    }
  }

  const handleViewFullListing = async () => {
    if (dealOfDay) {
      await window.spark.kv.set("highlightedDealId", dealOfDay.id)
      toast.success("Opening Deals page...")
    }
  }

  const handleRebalance = async () => {
    if (watches.length === 0) {
      toast.error("Add watches to your collection first")
      return
    }
    
    setIsLoadingRebalance(true)
    try {
      const { cacheKey, dependencyHash, cache } = await getAiCacheContext()
      if (cache?.dependencyHash === dependencyHash && cache.rebalanceAnalysis) {
        setRebalanceAnalysis(cache.rebalanceAnalysis)
        return
      }

      const totalValue = watches.reduce((sum, w) => sum + (w.currentValue || w.purchasePrice), 0)
      
      const brandBreakdown: Record<string, number> = {}
      watches.forEach(w => {
        const value = w.currentValue || w.purchasePrice
        brandBreakdown[w.brand] = (brandBreakdown[w.brand] || 0) + value
      })
      
      const brandPcts = Object.entries(brandBreakdown)
        .map(([brand, value]) => `${brand} ${Math.round((value / totalValue) * 100)}%`)
        .join(', ')
      
      const watchSummary = watches.map(w => ({
        brand: w.brand,
        reference: w.referenceNumber || w.model,
        purchasePrice: w.purchasePrice,
        currentMarketValue: w.currentValue || w.purchasePrice,
        condition: w.condition
      }))
      
      const promptText = `You are a luxury watch portfolio advisor. Analyze this collection and suggest a rebalancing strategy.

Collection: ${JSON.stringify(watchSummary)}
Total value: ${formatCurrency(totalValue, preferredCurrency)}. Brand breakdown: ${brandPcts}.

2025 market context: Rolex steel sports stable-to-recovering after correction, Patek Philippe +6% YTD, AP Royal Oak +4% YTD, Grand Seiko +12.8% YTD and fastest-growing, IWC/Omega flat.

Provide:
1. CONCENTRATION RISK: Identify any brand >50% of portfolio value and flag the risk
2. SELL RECOMMENDATION: Always provide this field. Name 1 specific watch to consider selling (the one most overweight or most likely at peak), with reasoning. If no sell action is needed, explicitly say: "No sell action needed — nothing should be done."
3. BUY RECOMMENDATION: Always provide this field. Suggest 1-2 specific references to add for better diversification, with approximate current market price and the investment thesis. If no buy action is needed, explicitly say: "No buy action needed — nothing should be done."
4. STRATEGIC SCORE: Rate the current portfolio balance 1-10 with a brief explanation

Respond in valid JSON format:
{
  "concentrationRisk": "Your analysis here",
  "sell": "Your sell recommendation here",
  "buy": "Your buy recommendation here",
  "strategicScore": {
    "score": number from 1-10,
    "explanation": "Brief explanation"
  }
}`

      const response = await callTrackedLlm(promptText, 'gpt-4o-mini', true)
      const parsedAnalysis = parseRebalanceAnalysis(response)
      setRebalanceAnalysis(parsedAnalysis)
      await saveAiCache(cacheKey, dependencyHash, { rebalanceAnalysis: parsedAnalysis }, cache)
    } catch (error) {
      toast.error("Failed to generate rebalancing analysis")
      console.error(error)
    } finally {
      setIsLoadingRebalance(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">AI Signal Engine</h1>
        <p className="text-muted-foreground mt-1">Intelligent insights powered by advanced AI</p>
      </div>

      {dealOfDay && (
        <Card className="bg-card border-2 border-primary shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Fire className="text-primary" size={24} weight="fill" />
                🔥 Deal of the Day
              </CardTitle>
              <Badge variant="outline" className="bg-muted/20">
                {isLiveDealData ? "Live Chrono24" : "Cached fallback"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingDeal ? (
              <div className="space-y-4">
                <div className="h-48 bg-muted/20 rounded animate-pulse"></div>
                <div className="h-6 bg-muted/20 rounded w-3/4 animate-pulse"></div>
                <div className="h-4 bg-muted/20 rounded w-1/2 animate-pulse"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {dealOfDay.imageUrl && (
                  <div className="w-full h-64 bg-muted/20 rounded-lg overflow-hidden">
                    <img 
                      src={dealOfDay.imageUrl} 
                      alt={`${dealOfDay.brand} ${dealOfDay.model}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                
                <div>
                  <h3 className="text-2xl font-semibold">{dealOfDay.brand} {dealOfDay.model}</h3>
                  {dealOfDay.referenceNumber && (
                    <p className="text-muted-foreground">Ref. {dealOfDay.referenceNumber}</p>
                  )}
                  {dealOfDay.year && (
                    <p className="text-muted-foreground">Year: {dealOfDay.year}</p>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">Condition: {dealOfDay.condition}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 py-4 border-y border-border">
                  <div>
                    <div className="text-sm text-muted-foreground">Asking Price</div>
                    <div className="text-2xl font-bold text-primary tabular-nums">
                      {formatCurrency(dealOfDay.price, preferredCurrency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Fair Value</div>
                    <div className="text-xl font-medium text-muted-foreground line-through tabular-nums">
                      {formatCurrency((dealOfDay.fairValue || dealOfDay.price), preferredCurrency)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 flex-wrap">
                  <Badge className="bg-success text-success-foreground text-base px-4 py-2">
                    <TrendDown className="mr-2" size={18} />
                    Save {formatCurrency(((dealOfDay.fairValue || dealOfDay.price) - dealOfDay.price), preferredCurrency)} 
                    ({Math.round((((dealOfDay.fairValue || dealOfDay.price) - dealOfDay.price) / (dealOfDay.fairValue || dealOfDay.price)) * 100)}% below fair value)
                  </Badge>
                  
                  <Badge 
                    variant="outline" 
                    className={`text-base px-4 py-2 ${
                      dealOfDay.dealScore && dealOfDay.dealScore >= 80 
                        ? 'bg-primary/10 text-primary border-primary' 
                        : 'bg-muted/20'
                    }`}
                  >
                    Score: {dealOfDay.dealScore}/100 — 
                    {dealOfDay.dealScore && dealOfDay.dealScore >= 80 ? ' Hot Deal' : ' Good Deal'}
                  </Badge>
                  
                  {dealOfDay.sellerRating && (
                    <Badge variant="outline" className="text-base px-4 py-2">
                      <Star className="mr-1" size={16} weight="fill" />
                      {dealOfDay.sellerRating.toFixed(1)} Seller Rating
                    </Badge>
                  )}
                </div>

                {dealAssessment && (
                  <Card className="bg-muted/10 border-border">
                    <CardContent className="pt-6">
                      <p className="text-sm italic">{dealAssessment}</p>
                    </CardContent>
                  </Card>
                )}

                <Button 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground mt-4"
                  onClick={handleViewFullListing}
                >
                  <ShoppingCart className="mr-2" size={20} />
                  View Full Listing
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {watches.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkle className="text-primary" size={24} />
              Portfolio Signals
            </CardTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={generateSignals}
              disabled={isLoadingSignals}
            >
              {isLoadingSignals ? 'Analyzing...' : 'Refresh Signals'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingSignals ? (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkle size={32} className="mx-auto mb-2 animate-pulse text-primary" />
                <p>Generating AI signals for your collection...</p>
              </div>
            ) : signals.length > 0 ? (
              signals.map((signal, idx) => (
                <div key={idx} className="p-4 rounded-lg border border-border bg-muted/10">
                  <div className="flex items-start gap-3">
                    <Badge 
                      variant="outline"
                      className={
                        signal.type === 'buy' ? 'bg-success/10 text-success border-success/30' :
                        signal.type === 'sell' ? 'bg-destructive/10 text-destructive border-destructive/30' :
                        'bg-primary/10 text-primary border-primary/30'
                      }
                    >
                      {signal.type.toUpperCase()}
                    </Badge>
                    <Badge 
                      variant="outline"
                      className={
                        signal.confidence === 'high' ? 'bg-primary/10 text-primary border-primary/30' :
                        signal.confidence === 'medium' ? 'bg-muted/20 text-muted-foreground border-border' :
                        'bg-muted/10 text-muted-foreground/70 border-border'
                      }
                    >
                      {signal.confidence} confidence
                    </Badge>
                  </div>
                  <div className="mt-3">
                    <div className="font-semibold mb-1">{signal.title}</div>
                    <div className="text-sm text-muted-foreground">{signal.reasoning}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <p>No signals generated yet</p>
                <p className="text-xs mt-1">Click "Refresh Signals" to analyze your collection</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {watches.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              ◈ Portfolio Rebalancing
            </CardTitle>
            <Button 
              variant="default" 
              size="sm"
              onClick={handleRebalance}
              disabled={isLoadingRebalance}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoadingRebalance ? 'Analyzing...' : 'Rebalance'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingRebalance ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-24 bg-muted/20 rounded animate-pulse"></div>
                ))}
              </div>
            ) : rebalanceAnalysis ? (
              <div className="space-y-4">
                <Card className="bg-muted/10 border-border">
                  <CardContent className="pt-6">
                    <h4 className="font-semibold text-sm text-muted-foreground mb-2">CONCENTRATION RISK</h4>
                    <p className="text-sm">{typeof rebalanceAnalysis.concentrationRisk === 'string' ? rebalanceAnalysis.concentrationRisk : JSON.stringify(rebalanceAnalysis.concentrationRisk)}</p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/10 border-2 border-[#A0785A]">
                  <CardContent className="pt-6">
                    <h4 className="font-semibold text-sm text-[#A0785A] mb-2">SELL RECOMMENDATION</h4>
                    <p className="text-sm">{typeof rebalanceAnalysis.sell === 'string' ? rebalanceAnalysis.sell : JSON.stringify(rebalanceAnalysis.sell)}</p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/10 border-2 border-[#5E8C6A]">
                  <CardContent className="pt-6">
                    <h4 className="font-semibold text-sm text-[#5E8C6A] mb-2">BUY RECOMMENDATION</h4>
                    <p className="text-sm">{typeof rebalanceAnalysis.buy === 'string' ? rebalanceAnalysis.buy : JSON.stringify(rebalanceAnalysis.buy)}</p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/10 border-border">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-muted-foreground">STRATEGIC SCORE</h4>
                      <Badge className="bg-primary text-primary-foreground text-lg px-4 py-1">
                        {rebalanceAnalysis.strategicScore.score}/10
                      </Badge>
                    </div>
                    <p className="text-sm mt-3">{rebalanceAnalysis.strategicScore.explanation}</p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <TrendUp size={48} className="mx-auto mb-3 text-primary/50" />
                <p>Click "Rebalance" to generate portfolio optimization recommendations</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>AI Chat Advisor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="min-h-[300px] max-h-[400px] overflow-y-auto space-y-3 p-4 rounded-lg bg-black/20 border border-border">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    <Sparkle size={48} className="mx-auto mb-3 text-primary/50" />
                    <p className="mb-6">Ask me anything about luxury watches, your collection, or market insights.</p>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground mb-3">Try one of these questions:</p>
                      {STARTER_QUESTIONS.map((q, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleStarterQuestion(q)}
                          className="block w-full text-left px-4 py-2 text-sm bg-muted/10 hover:bg-muted/20 rounded border border-border transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-3 rounded-lg ${
                        msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted/20 border border-border'
                      }`}>
                        <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  ))
                )}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted/20 border border-border p-3 rounded-lg">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Textarea
                  placeholder="Ask about collecting strategy, market trends, or your portfolio..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  rows={2}
                  disabled={isLoading}
                />
                <Button 
                  onClick={handleSendMessage} 
                  disabled={!chatInput.trim() || isLoading}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <PaperPlaneTilt size={20} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon size={20} />
              Watch Identifier
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!identifiedWatch ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="watch-image">Watch Photo</Label>
                  <div className="flex gap-2">
                    <Input
                      id="watch-image"
                      value={identifierInputValue}
                      onChange={(e) => setIdentifierImage(e.target.value)}
                      placeholder="Paste image URL or upload a photo..."
                    />
                    <input
                      type="file"
                      id="watch-identifier-image-upload"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleIdentifierFileUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('watch-identifier-image-upload')?.click()}
                      className="whitespace-nowrap"
                    >
                      <FileArrowUp className="mr-2" size={16} />
                      Upload
                    </Button>
                  </div>
                  {identifierPreviewImage && (
                    <div className="mt-2">
                      <img 
                        src={identifierPreviewImage} 
                        alt="Watch to identify" 
                        className="w-full h-48 object-cover rounded border border-border"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement
                          target.style.display = 'none'
                        }}
                      />
                    </div>
                  )}
                </div>
                <Button 
                  onClick={handleIdentifyWatch}
                  disabled={!safeIdentifierImage || isIdentifying}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {isIdentifying ? 'Identifying...' : 'Identify Watch'}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Upload a clear photo showing the watch dial and case for best results
                </p>
              </>
            ) : (
              <div className="space-y-4">
                {identifiedWatch.imageUrl && (
                  <div className="w-full h-48 bg-muted/20 rounded overflow-hidden">
                    <img 
                      src={identifiedWatch.imageUrl} 
                      alt="Identified watch" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Brand</div>
                    <div className="text-xl font-semibold">{identifiedWatch.brand}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Model</div>
                    <div className="text-lg">{identifiedWatch.model}</div>
                  </div>
                  {identifiedWatch.reference && identifiedWatch.reference !== 'Unknown' && (
                    <div>
                      <div className="text-sm text-muted-foreground">Reference</div>
                      <div>{identifiedWatch.reference}</div>
                    </div>
                  )}
                  {identifiedWatch.value > 0 && (
                    <div>
                      <div className="text-sm text-muted-foreground">Estimated Value</div>
                      <div className="text-xl font-semibold text-primary tabular-nums">
                        {formatCurrency(identifiedWatch.value, preferredCurrency)}
                      </div>
                    </div>
                  )}
                  <div className="pt-2 border-t border-border">
                    <div className="text-sm text-muted-foreground mb-1">Key Features</div>
                    <div className="text-sm">{identifiedWatch.features}</div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button 
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setIdentifiedWatch(null)
                      setIdentifierImage('')
                    }}
                  >
                    Try Another
                  </Button>
                  <Button 
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={handleAddToCollection}
                  >
                    <Plus className="mr-2" size={16} />
                    Add to Collection
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
