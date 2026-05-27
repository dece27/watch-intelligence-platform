import { useEffect, useMemo, useState } from "react"
import { Watch, PriceAlert } from "@/lib/types"
import { AuctionResult, fetchRecentAuctionResults } from "@/lib/auction-feeds"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TrendUp, TrendDown, Bell, X, MagnifyingGlass } from "@phosphor-icons/react"
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { toast } from "sonner"
import { formatCurrency } from "@/lib/currency"
import { useKV } from "@/lib/useKV"
import {
  evaluatePriceAlerts,
  getMarketDashboardData,
  getReferenceMarketData,
  marketConfidenceLabel,
  type BrandMarketIndex,
  type MarketMover,
  type NormalizedMarketData,
  type PriceAlertEvaluation,
} from "@/lib/market-data"

interface MarketModuleProps {
  watches: Watch[]
  preferredCurrency?: string
}

const getHostname = (url: string): string | undefined => {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

const isTrustedHost = (hostname: string, trustedDomain: string): boolean => {
  const normalizedHost = hostname.toLowerCase()
  return normalizedHost === trustedDomain || normalizedHost.endsWith(`.${trustedDomain}`)
}

const FALLBACK_AUCTION_RESULTS: AuctionResult[] = [
  {
    house: 'Phillips Geneva',
    date: '2025-11-09',
    lot: 'Patek Philippe Ref. 1518 (Steel)',
    result: 17631075,
    notes: 'Hammer: CHF 14,190,000 (USD equivalent shown)',
    sourceUrl: 'https://www.phillips.com/detail/patek-philippe/CH080125/23',
    reference: '1518',
  },
  {
    house: 'Phillips New York',
    date: '2025-06-08',
    lot: 'Patek Philippe Ref. 1518 (Yellow Gold)',
    result: 1451500,
    notes: 'Hammer price',
    sourceUrl: 'https://www.phillips.com/detail/patek-philippe/NY080125/20',
    reference: '1518',
  },
  {
    house: "Christie's Geneva",
    date: '2025-05-12',
    lot: 'Richard Mille RM27-01 Rafael Nadal',
    result: 1491942,
    notes: 'Hammer: CHF 1,255,000 (USD equivalent shown)',
    sourceUrl: 'https://www.christies.com/en/lot/lot-6467519',
    reference: 'RM27-01',
  },
  {
    house: "Christie's Geneva",
    date: '2025-05-12',
    lot: 'Rolex Ref. 6264 Paul Newman "John Player Special"',
    result: 1198309,
    notes: 'Hammer: CHF 1,008,000 (USD equivalent shown)',
    sourceUrl: 'https://www.christies.com/en/lot/lot-6467526',
    reference: '6264',
  },
  {
    house: "Christie's Geneva",
    date: '2025-05-12',
    lot: 'Cartier Crash Ref. 4131 (Special Order)',
    result: 898732,
    notes: 'Hammer: CHF 736,000 (USD equivalent shown)',
    sourceUrl: 'https://www.christies.com/en/lot/lot-6467607',
    reference: '4131',
  },
  {
    house: 'Phillips Geneva',
    date: '2025-11-09',
    lot: 'F.P. Journe Chronomètre à Résonance Souscription No. 2',
    result: 3327000,
    notes: 'Hammer: CHF 3,327,000',
    sourceUrl: 'https://www.phillips.com/detail/fp-journe/CH080125/182',
    reference: 'resonance',
  },
]

const AUCTION_SEARCH_TERMS = ['1518', '6264', '4131', 'rm27-01', 'resonance', 'tourbillon souverain']
const AUCTION_BRANDS = [
  'Patek Philippe',
  'Audemars Piguet',
  'Richard Mille',
  'Grand Seiko',
  'F.P. Journe',
  'Rolex',
  'Cartier',
  'Omega',
  'IWC',
].sort((left, right) => right.length - left.length)
const AUCTION_TITLE_LEADING_SEPARATOR_PATTERN = /^[\u2010-\u2015\-:\s]+/
const AUCTION_TITLE_REFERENCE_PREFIX_PATTERN = /^Ref\.?\s*/i
const SENTIMENT_LINE_COLORS = ['#5E8C6A', '#4A7C90', '#C9A84C', '#A0785A', '#6A5ACD', '#3B9D9D']
const GOLDEN_ANGLE_DEGREES = 137.508
const SENTIMENT_Y_AXIS_PADDING = 2

const formatAuctionDate = (dateValue: string) => {
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) {
    return dateValue
  }
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const getAuctionSourceLabel = (auction: AuctionResult) => {
  if (auction.sourceUrl) {
    const hostname = getHostname(auction.sourceUrl)
    if (hostname && isTrustedHost(hostname, 'christies.com')) {
      return "Christie's"
    }
    if (hostname && isTrustedHost(hostname, 'phillips.com')) {
      return 'Phillips'
    }
  }

  const normalizedHouse = auction.house.trim().toLowerCase()
  if (normalizedHouse.startsWith("christie's") || normalizedHouse.startsWith('christies')) {
    return "Christie's"
  }
  if (normalizedHouse.startsWith('phillips')) {
    return 'Phillips'
  }
  return 'Auction result'
}

const getAuctionBrandAndModel = (auction: AuctionResult) => {
  const lot = auction.lot.trim()
  const normalizedLot = lot.toLowerCase()
  const matchedBrand = AUCTION_BRANDS.find((brand) => normalizedLot.includes(brand.toLowerCase()))

  if (!matchedBrand) {
    return {
      brand: '—',
      model: lot || '—',
    }
  }

  const brandStartIndex = normalizedLot.indexOf(matchedBrand.toLowerCase())
  const model = lot
    .slice(brandStartIndex + matchedBrand.length)
    .replace(AUCTION_TITLE_LEADING_SEPARATOR_PATTERN, '')
    .replace(AUCTION_TITLE_REFERENCE_PREFIX_PATTERN, '')
    .trim()

  return {
    brand: matchedBrand,
    model: model || '—',
  }
}

const getTrendChange = (trend: number[], months: number) => {
  if (trend.length < 2) return 0

  const current = trend[trend.length - 1]
  const startIndex = Math.max(0, trend.length - 1 - months)
  const baseline = trend[startIndex]

  if (!baseline) return 0

  return ((current - baseline) / baseline) * 100
}

const formatTrend = (change: number) => `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`
const TREND_METRIC_STYLES = {
  positive: {
    iconClassName: 'text-success',
    valueClassName: 'text-success',
    cardClassName: 'border-success/20 bg-success/5'
  },
  negative: {
    iconClassName: 'text-destructive',
    valueClassName: 'text-destructive',
    cardClassName: 'border-destructive/20 bg-destructive/5'
  }
} as const

const getTrendMetricStyle = (isPositive: boolean) =>
  isPositive ? TREND_METRIC_STYLES.positive : TREND_METRIC_STYLES.negative

const TREND_METRIC_CONFIGS = [
  { key: 'oneMonthChange', label: '1M', description: 'vs last month' },
  { key: 'sixMonthChange', label: '6M', description: 'vs 6 months ago' },
  { key: 'twelveMonthChange', label: '12M', description: 'vs 12 months ago' }
] as const

export function MarketModule({ watches, preferredCurrency = "USD" }: MarketModuleProps) {
  const [priceAlerts, setPriceAlerts] = useKV<PriceAlert[]>("priceAlerts", [])
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false)
  const [brandIndices, setBrandIndices] = useState<BrandMarketIndex[]>([])
  const [topMovers, setTopMovers] = useState<MarketMover[]>([])
  const [marketDataUpdatedAt, setMarketDataUpdatedAt] = useState<string | null>(null)
  const [referenceSnapshot, setReferenceSnapshot] = useState<NormalizedMarketData | null>(null)
  const [isReferenceLoading, setIsReferenceLoading] = useState(false)
  const [alertEvaluations, setAlertEvaluations] = useState<Record<string, PriceAlertEvaluation>>({})
  const [auctionResults, setAuctionResults] = useState<AuctionResult[]>(FALLBACK_AUCTION_RESULTS)
  const [isAuctionResultsLoading, setIsAuctionResultsLoading] = useState(false)
  const [auctionResultsDataSource, setAuctionResultsDataSource] = useState<'live' | 'fallback'>('fallback')
  const [auctionResultsUpdatedAt, setAuctionResultsUpdatedAt] = useState<string | null>(null)
  const [searchReference, setSearchReference] = useState('')
  const [newAlert, setNewAlert] = useState({
    watchRef: '',
    brand: '',
    model: '',
    condition: 'above' as 'above' | 'below',
    targetPrice: ''
  })

  const alerts = useMemo(() => priceAlerts || [], [priceAlerts])

  const userBrands = useMemo(() => {
    return new Set(watches.map(w => w.brand))
  }, [watches])

  const overallIndex = useMemo(() => {
    if (brandIndices.length === 0) return "100.0"
    const total = brandIndices.reduce((sum, b) => sum + b.currentIndex, 0)
    return (total / brandIndices.length).toFixed(1)
  }, [brandIndices])

  const overallChange1m = useMemo(() => {
    if (brandIndices.length === 0) return 0
    const total = brandIndices.reduce((sum, b) => sum + getTrendChange(b.trend, 1), 0)
    return Number((total / brandIndices.length).toFixed(1))
  }, [brandIndices])

  const marketSentiment = useMemo(() => {
    const positiveCount = brandIndices.filter(b => getTrendChange(b.trend, 1) > 0).length
    const sentimentScores = brandIndices
      .map((brand) => brand.sentimentScore)
      .filter((score): score is number => typeof score === "number" && Number.isFinite(score))
    const averageSentimentScore = sentimentScores.length > 0
      ? sentimentScores.reduce((sum, score) => sum + score, 0) / sentimentScores.length
      : 0
    if (positiveCount >= Math.max(4, Math.floor(brandIndices.length * 0.7)) || averageSentimentScore > 1.5) return { type: 'bull', color: '#5E8C6A', label: 'BULL 🐂' }
    if (positiveCount >= Math.max(2, Math.floor(brandIndices.length * 0.45)) || averageSentimentScore >= -0.5) return { type: 'neutral', color: '#C9A84C', label: 'NEUTRAL —' }
    return { type: 'bear', color: '#A0785A', label: 'BEAR 🐻' }
  }, [brandIndices])

  const positiveBrandsCount = useMemo(() => {
    return brandIndices.filter(b => getTrendChange(b.trend, 1) > 0).length
  }, [brandIndices])

  const sentimentMonthLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short' })
    const now = new Date()

    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now)
      date.setMonth(now.getMonth() - (11 - index))
      return formatter.format(date)
    })
  }, [])

  const brandSentimentSeries = useMemo(() => {
    const getLineColor = (index: number) => {
      if (index < SENTIMENT_LINE_COLORS.length) {
        return SENTIMENT_LINE_COLORS[index]
      }

      const hue = Math.round((index * GOLDEN_ANGLE_DEGREES) % 360)
      return `hsl(${hue}, 52%, 46%)`
    }

    return brandIndices.map((brandIndex, index) => ({
      key: `brand-${index}`,
      brand: brandIndex.brand,
      trend: brandIndex.trend,
      color: getLineColor(index),
    }))
  }, [brandIndices])

  const [visibleSentimentBrands, setVisibleSentimentBrands] = useState<string[]>(() =>
    brandIndices.map((_, index) => `brand-${index}`)
  )

  const overallSentimentChartData = useMemo(() => {
    return sentimentMonthLabels.map((month, monthIndex) => {
      const point: { month: string; [key: string]: number | string | null } = { month }
      brandSentimentSeries.forEach((series) => {
        point[series.key] = series.trend[monthIndex] ?? null
      })
      return point
    })
  }, [brandSentimentSeries, sentimentMonthLabels])

  const toggleSentimentBrandVisibility = (seriesKey: string) => {
    setVisibleSentimentBrands((current) => {
      if (current.includes(seriesKey)) {
        if (current.length === 1) return current
        return current.filter((key) => key !== seriesKey)
      }
      return [...current, seriesKey]
    })
  }

  useEffect(() => {
    const keys = brandSentimentSeries.map((series) => series.key)
    if (keys.length === 0) {
      setVisibleSentimentBrands([])
      return
    }
    setVisibleSentimentBrands((current) => {
      const retained = current.filter((key) => keys.includes(key))
      return retained.length > 0 ? retained : keys
    })
  }, [brandSentimentSeries])

  useEffect(() => {
    let isMounted = true

    const loadMarketData = async () => {
      try {
        const dashboardData = await getMarketDashboardData(watches)
        if (!isMounted) return
        setBrandIndices(dashboardData.brandIndices)
        setTopMovers(dashboardData.topMovers)
        setMarketDataUpdatedAt(dashboardData.updatedAt)
      } catch {
        if (!isMounted) return
        setBrandIndices([])
        setTopMovers([])
      }
    }

    void loadMarketData()
    return () => {
      isMounted = false
    }
  }, [watches])

  useEffect(() => {
    let isMounted = true

    const loadAuctionResults = async () => {
      setIsAuctionResultsLoading(true)
      try {
        const liveResults = await fetchRecentAuctionResults({ references: AUCTION_SEARCH_TERMS, limit: 8 })
        if (!isMounted) return

        if (liveResults.length > 0) {
          setAuctionResults(liveResults)
          setAuctionResultsDataSource('live')
          setAuctionResultsUpdatedAt(new Date().toISOString())
          return
        }

        setAuctionResults(FALLBACK_AUCTION_RESULTS)
        setAuctionResultsDataSource('fallback')
      } catch {
        if (!isMounted) return
        setAuctionResults(FALLBACK_AUCTION_RESULTS)
        setAuctionResultsDataSource('fallback')
      } finally {
        if (isMounted) {
          setIsAuctionResultsLoading(false)
        }
      }
    }

    loadAuctionResults()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    const trimmedReference = searchReference.trim()
    if (!trimmedReference) {
      setReferenceSnapshot(null)
      return
    }

    const timeout = window.setTimeout(async () => {
      setIsReferenceLoading(true)
      try {
        const snapshot = await getReferenceMarketData({ reference: trimmedReference })
        if (isMounted) {
          setReferenceSnapshot(snapshot)
        }
      } catch {
        if (isMounted) {
          setReferenceSnapshot(null)
        }
      } finally {
        if (isMounted) {
          setIsReferenceLoading(false)
        }
      }
    }, 300)

    return () => {
      isMounted = false
      window.clearTimeout(timeout)
    }
  }, [searchReference])

  useEffect(() => {
    let isMounted = true
    const loadAlertEvaluations = async () => {
      if (alerts.length === 0) {
        if (isMounted) setAlertEvaluations({})
        return
      }
      try {
        const evaluations = await evaluatePriceAlerts(alerts, preferredCurrency)
        if (isMounted) {
          setAlertEvaluations(evaluations)
        }
      } catch {
        if (isMounted) {
          setAlertEvaluations({})
        }
      }
    }
    void loadAlertEvaluations()

    return () => {
      isMounted = false
    }
  }, [alerts, preferredCurrency])

  const handleAddAlert = () => {
    if (!newAlert.watchRef || !newAlert.brand || !newAlert.model || !newAlert.targetPrice) {
      toast.error("Please fill in all fields")
      return
    }

    const alert: PriceAlert = {
      id: `alert-${Date.now()}`,
      watchRef: newAlert.watchRef,
      brand: newAlert.brand,
      model: newAlert.model,
      condition: newAlert.condition,
      targetPrice: parseFloat(newAlert.targetPrice),
      createdAt: new Date().toISOString()
    }

    setPriceAlerts(current => [...(current || []), alert])
    toast.success("Price alert created")
    setIsAlertDialogOpen(false)
    setNewAlert({
      watchRef: '',
      brand: '',
      model: '',
      condition: 'above',
      targetPrice: ''
    })
  }

  const handleDeleteAlert = (id: string) => {
    setPriceAlerts(current => (current || []).filter(a => a.id !== id))
    toast.success("Price alert removed")
  }

  const priceHistoryData = searchReference
    ? (referenceSnapshot?.series12m || []).map((point) => ({ month: point.month, price: point.price }))
    : []

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Market Intelligence</h1>
        <p className="text-muted-foreground text-sm md:text-base mt-1">
          Real-time market indices and price trends
          {marketDataUpdatedAt ? ` · Last refresh ${new Date(marketDataUpdatedAt).toLocaleString()}` : ""}
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="py-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="text-sm font-medium text-muted-foreground whitespace-nowrap">Market Sentiment:</div>
              <div 
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-semibold text-sm"
                style={{ 
                  backgroundColor: `${marketSentiment.color}20`,
                  color: marketSentiment.color,
                  border: `1.5px solid ${marketSentiment.color}40`
                }}
              >
                <div 
                  className="w-1.5 h-1.5 rounded-full animate-pulse" 
                  style={{ backgroundColor: marketSentiment.color }}
                />
                {marketSentiment.label}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">1m Trend</div>
              <div className="text-sm font-medium">{positiveBrandsCount}/{brandIndices.length || 1} brands positive</div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overallSentimentChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    domain={[
                      `dataMin - ${SENTIMENT_Y_AXIS_PADDING}`,
                      `dataMax + ${SENTIMENT_Y_AXIS_PADDING}`,
                    ]}
                    width={40}
                  />
                  <Tooltip />
                  <Legend />
                  {brandSentimentSeries
                    .filter((series) => visibleSentimentBrands.includes(series.key))
                    .map((series) => (
                      <Line
                        key={series.key}
                        type="monotone"
                        dataKey={series.key}
                        name={series.brand}
                        stroke={series.color}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2">
              {brandSentimentSeries.map((series) => {
                const isVisible = visibleSentimentBrands.includes(series.key)
                return (
                  <Button
                    key={series.key}
                    type="button"
                    variant={isVisible ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleSentimentBrandVisibility(series.key)}
                    className="h-8"
                  >
                    <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: series.color }} />
                    {series.brand}
                  </Button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Market</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums text-primary">{overallIndex}</div>
            <div className="flex items-center gap-1 mt-1">
              {overallChange1m >= 0 ? <TrendUp className="text-success" size={14} /> : <TrendDown className="text-destructive" size={14} />}
              <span className={overallChange1m >= 0 ? 'text-xs text-success' : 'text-xs text-destructive'}>{formatTrend(overallChange1m)} (1m)</span>
            </div>
          </CardContent>
        </Card>

        {brandIndices.slice(0, 3).map((brandIndex) => {
          const oneMonthChange = getTrendChange(brandIndex.trend, 1)
          return (
            <Card key={brandIndex.brand} className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">{brandIndex.brand} Index</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tabular-nums">{brandIndex.currentIndex}</div>
                <div className="flex items-center gap-1 mt-1">
                  {oneMonthChange >= 0 ? <TrendUp className="text-success" size={14} /> : <TrendDown className="text-destructive" size={14} />}
                  <span className={oneMonthChange >= 0 ? 'text-xs text-success' : 'text-xs text-destructive'}>{formatTrend(oneMonthChange)} (1m)</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {brandIndex.source} · {marketConfidenceLabel(brandIndex.confidence)} confidence
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {brandIndices.map((brandIndex) => {
          const isOwned = userBrands.has(brandIndex.brand)
          const oneMonthChange = getTrendChange(brandIndex.trend, 1)
          const sixMonthChange = getTrendChange(brandIndex.trend, 6)
          const twelveMonthChange = getTrendChange(brandIndex.trend, brandIndex.trend.length - 1)
          const trendChanges = {
            oneMonthChange,
            sixMonthChange,
            twelveMonthChange
          }

          return (
            <Card key={brandIndex.brand} className={`bg-card border-border ${isOwned ? 'ring-2 ring-primary/30' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{brandIndex.brand}</CardTitle>
                  {isOwned && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
                      In Collection
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Current Index</div>
                  <div className="text-2xl font-semibold tabular-nums">{brandIndex.currentIndex}</div>
                  <div className="text-xs text-muted-foreground">
                    {brandIndex.source} · Updated {new Date(brandIndex.updatedAt).toLocaleDateString()} · {marketConfidenceLabel(brandIndex.confidence)}
                  </div>
                  {typeof brandIndex.sentimentScore === "number" && (
                    <div className="text-xs text-muted-foreground">
                      GDELT tone: {brandIndex.sentimentScore.toFixed(2)}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {TREND_METRIC_CONFIGS.map((metric) => {
                    const metricChange = trendChanges[metric.key]
                    const isPositive = metricChange >= 0
                    const trendMetricStyle = getTrendMetricStyle(isPositive)
                    return (
                      <div
                        key={metric.label}
                        aria-label={`${metric.label} ${formatTrend(metricChange)} ${metric.description}`}
                        role="group"
                        className={`rounded-xl border px-3 py-4 transition-colors ${trendMetricStyle.cardClassName}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium text-muted-foreground">
                            {metric.label}
                          </div>
                          {isPositive ? (
                            <TrendUp aria-hidden="true" className={trendMetricStyle.iconClassName} size={18} weight="bold" />
                          ) : (
                            <TrendDown aria-hidden="true" className={trendMetricStyle.iconClassName} size={18} weight="bold" />
                          )}
                        </div>
                        <div className={`mt-3 text-2xl font-semibold tabular-nums ${trendMetricStyle.valueClassName}`}>
                          {formatTrend(metricChange)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {metric.description}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Top Movers (12m Change %)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topMovers.map((mover, idx) => (
              <div key={`${mover.reference}-${idx}`} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div className="flex items-center gap-3 flex-1">
                  {mover.direction === 'up' ? (
                    <TrendUp style={{ color: '#5E8C6A' }} size={20} />
                  ) : (
                    <TrendDown style={{ color: '#A0785A' }} size={20} />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{mover.reference || `${mover.brand} ${mover.model}`}</div>
                    <div className="text-sm text-muted-foreground">{mover.brand} · {mover.source}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{formatCurrency(mover.currentPrice, preferredCurrency)}</div>
                  </div>
                  <Badge 
                    variant="outline"
                    className={
                      mover.direction === 'up' 
                        ? 'bg-[#5E8C6A]/10 border-[#5E8C6A]/30' 
                        : 'bg-[#A0785A]/10 border-[#A0785A]/30'
                    }
                    style={{
                      color: mover.direction === 'up' ? '#5E8C6A' : '#A0785A'
                    }}
                  >
                    {mover.direction === 'up' ? '+' : ''}{mover.change}%
                  </Badge>
                </div>
              </div>
            ))}
            {topMovers.length === 0 && (
              <div className="text-sm text-muted-foreground">No live movers available right now.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Reference Price Search</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                placeholder="Enter reference number (e.g., 126610LN)"
                value={searchReference}
                onChange={(e) => setSearchReference(e.target.value)}
                className="pl-10"
              />
            </div>

            {searchReference && (
              <div className="space-y-3">
                <div className="p-4 border border-border rounded-lg bg-muted/10">
                  <div className="font-medium mb-1">
                    {referenceSnapshot ? `${referenceSnapshot.brand} ${referenceSnapshot.model}` : searchReference}
                  </div>
                  <div className="text-2xl font-semibold text-primary mb-2 tabular-nums">
                    {referenceSnapshot
                      ? formatCurrency(referenceSnapshot.latestPrice, preferredCurrency, { sourceCurrency: referenceSnapshot.currency })
                      : "—"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {isReferenceLoading
                      ? "Loading latest market snapshot..."
                      : referenceSnapshot
                        ? `Source: ${referenceSnapshot.source} · Updated: ${new Date(referenceSnapshot.updatedAt).toLocaleString()} · Confidence: ${marketConfidenceLabel(referenceSnapshot.confidence)}`
                        : "No reference data available yet."}
                  </div>
                </div>

                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={priceHistoryData}>
                      <Line 
                        type="monotone" 
                        dataKey="price" 
                        stroke="oklch(0.72 0.09 85)" 
                        strokeWidth={2}
                        dot={{ fill: 'oklch(0.72 0.09 85)', r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Price Alerts</CardTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsAlertDialogOpen(true)}
            >
              <Bell className="mr-2" size={16} />
              New Alert
            </Button>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Bell size={32} className="mx-auto mb-2 opacity-50" />
                <p>No active price alerts</p>
                <p className="text-xs mt-1">Create alerts to track target prices</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => {
                  const evaluation = alertEvaluations[alert.id]
                  return (
                    <div key={alert.id} className="flex items-start justify-between p-3 border border-border rounded-lg bg-muted/10">
                    <div className="flex-1">
                      <div className="font-medium">{alert.brand} {alert.model}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Alert when price goes {alert.condition} <span className="font-semibold tabular-nums">{formatCurrency(alert.targetPrice, preferredCurrency)}</span>
                      </div>
                      {evaluation && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Live: {formatCurrency(evaluation.latestPrice || 0, preferredCurrency)} · {evaluation.source} · {marketConfidenceLabel(evaluation.confidence)}
                          {evaluation.isTriggered ? " · Triggered" : ""}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        Created {new Date(alert.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAlert(alert.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <X size={16} />
                    </Button>
                  </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <div>
            <CardTitle>Recent Auction Results</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Phillips & Christie&apos;s · Grail references sold in the last 12 months
              {isAuctionResultsLoading ? ' · Syncing live feed…' : ''}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">House</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Date</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Brand</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Model</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Reference</th>
                  <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Auction Price Sold</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Link</th>
                </tr>
              </thead>
              <tbody>
                {auctionResults.map((auction, idx) => {
                  const { brand, model } = getAuctionBrandAndModel(auction)

                  return (
                    <tr key={idx} className="border-b border-border last:border-0">
                      <td className="py-3 px-2 text-sm">{auction.house}</td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">{formatAuctionDate(auction.date)}</td>
                      <td className="py-3 px-2 text-sm">{brand}</td>
                      <td className="py-3 px-2 text-sm">{model}</td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">{auction.reference || '—'}</td>
                      <td className="py-3 px-2 text-sm text-right font-bold tabular-nums">
                        {formatCurrency(auction.result, preferredCurrency)}
                      </td>
                      <td className="py-3 px-2 text-sm">
                        {auction.sourceUrl ? (
                          <a
                            href={auction.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${getAuctionSourceLabel(auction)} auction result in a new tab`}
                            className="text-primary underline underline-offset-4 hover:text-primary/80"
                          >
                            Link
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
            Sources: {auctionResultsDataSource === 'live' ? 'Live Phillips/Christie’s feeds' : 'Fallback cached data'}.
            {auctionResultsUpdatedAt ? ` Last sync: ${new Date(auctionResultsUpdatedAt).toLocaleString()}.` : ''}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isAlertDialogOpen} onOpenChange={setIsAlertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Price Alert</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="alert-ref">Reference Number</Label>
              <Input
                id="alert-ref"
                value={newAlert.watchRef}
                onChange={(e) => setNewAlert({ ...newAlert, watchRef: e.target.value })}
                placeholder="e.g., 126610LN"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="alert-brand">Brand</Label>
                <Input
                  id="alert-brand"
                  value={newAlert.brand}
                  onChange={(e) => setNewAlert({ ...newAlert, brand: e.target.value })}
                  placeholder="e.g., Rolex"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="alert-model">Model</Label>
                <Input
                  id="alert-model"
                  value={newAlert.model}
                  onChange={(e) => setNewAlert({ ...newAlert, model: e.target.value })}
                  placeholder="e.g., Submariner"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="alert-condition">Condition</Label>
                <Select
                  value={newAlert.condition}
                  onValueChange={(value: 'above' | 'below') => setNewAlert({ ...newAlert, condition: value })}
                >
                  <SelectTrigger id="alert-condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="above">Above</SelectItem>
                    <SelectItem value="below">Below</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="alert-price">Target Price ({preferredCurrency})</Label>
                <Input
                  id="alert-price"
                  type="number"
                  value={newAlert.targetPrice}
                  onChange={(e) => setNewAlert({ ...newAlert, targetPrice: e.target.value })}
                  placeholder="e.g., 10000"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setIsAlertDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddAlert} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Create Alert
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
