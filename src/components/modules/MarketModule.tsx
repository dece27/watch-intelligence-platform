import { useEffect, useMemo, useState } from "react"
import { useKV } from "@github/spark/hooks"
import { Watch, BrandIndex, PriceAlert } from "@/lib/types"
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

interface MarketModuleProps {
  watches: Watch[]
}

const BRAND_INDICES: BrandIndex[] = [
  {
    brand: 'Rolex',
    currentIndex: 127.5,
    trend: [120, 122, 121, 123, 125, 124, 126, 127, 128, 127, 128, 127.5]
  },
  {
    brand: 'Patek Philippe',
    currentIndex: 142.8,
    trend: [128, 130, 132, 135, 137, 138, 140, 141, 142, 143, 142, 142.8]
  },
  {
    brand: 'Audemars Piguet',
    currentIndex: 135.2,
    trend: [123, 125, 127, 128, 130, 131, 132, 133, 134, 135, 136, 135.2]
  },
  {
    brand: 'IWC',
    currentIndex: 112.7,
    trend: [107, 108, 109, 109, 110, 111, 111, 112, 112, 113, 113, 112.7]
  },
  {
    brand: 'Omega',
    currentIndex: 108.4,
    trend: [105, 105, 106, 106, 107, 107, 108, 108, 108, 109, 108, 108.4]
  },
  {
    brand: 'Grand Seiko',
    currentIndex: 115.9,
    trend: [108, 109, 110, 111, 112, 113, 114, 114, 115, 116, 116, 115.9]
  }
]

const TOP_MOVERS = [
  { reference: 'Daytona 126500LN', brand: 'Rolex', currentPrice: 33000, change: 0.3, direction: 'up' as const },
  { reference: 'Daytona 116500LN', brand: 'Rolex', currentPrice: 31000, change: -1.2, direction: 'down' as const },
  { reference: 'Nautilus 5712/1A', brand: 'Patek Philippe', currentPrice: 125000, change: 1.1, direction: 'up' as const },
  { reference: 'Aquanaut 5167/1A', brand: 'Patek Philippe', currentPrice: 54000, change: 0.9, direction: 'up' as const },
  { reference: 'SLGH005 White Birch', brand: 'Grand Seiko', currentPrice: 7200, change: 1.3, direction: 'up' as const },
  { reference: 'Submariner 124060', brand: 'Rolex', currentPrice: 11400, change: -0.8, direction: 'down' as const },
  { reference: 'Royal Oak 15202ST', brand: 'Audemars Piguet', currentPrice: 65000, change: 2.1, direction: 'up' as const },
  { reference: 'GMT-Master II Pepsi', brand: 'Rolex', currentPrice: 21000, change: 0.8, direction: 'up' as const }
]

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
    sourceUrl: 'https://www.christies.com/en/lot/lot-6468372',
    reference: 'RM27-01',
  },
  {
    house: "Christie's Geneva",
    date: '2025-05-12',
    lot: 'Rolex Ref. 6264 Paul Newman "John Player Special"',
    result: 1198309,
    notes: 'Hammer: CHF 1,008,000 (USD equivalent shown)',
    sourceUrl: 'https://www.christies.com/en/lot/lot-6468370',
    reference: '6264',
  },
  {
    house: "Christie's Geneva",
    date: '2025-05-12',
    lot: 'Cartier Crash Ref. 4131 (Special Order)',
    result: 898732,
    notes: 'Hammer: CHF 736,000 (USD equivalent shown)',
    sourceUrl: 'https://www.christies.com/en/lot/lot-6468371',
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

const getEstimatePerformanceLabel = (hasEstimate: boolean, aboveEstimate: boolean, withinEstimate: boolean) => {
  if (!hasEstimate) {
    return 'Estimate unavailable'
  }

  if (aboveEstimate) {
    return 'Above estimate'
  }

  if (withinEstimate) {
    return 'Within estimate'
  }

  return 'Below estimate'
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
const getTrendDirectionColor = (change: number) => change >= 0 ? 'text-success' : 'text-destructive'
const getTrendMetricCardClass = (change: number) =>
  change >= 0
    ? 'border-success/20 bg-success/5'
    : 'border-destructive/20 bg-destructive/5'

export function MarketModule({ watches }: MarketModuleProps) {
  const [priceAlerts, setPriceAlerts] = useKV<PriceAlert[]>("priceAlerts", [])
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false)
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

  const alerts = priceAlerts || []

  const userBrands = useMemo(() => {
    return new Set(watches.map(w => w.brand))
  }, [watches])

  const overallIndex = useMemo(() => {
    const total = BRAND_INDICES.reduce((sum, b) => sum + b.currentIndex, 0)
    return (total / BRAND_INDICES.length).toFixed(1)
  }, [])

  const overallChange1m = useMemo(() => {
    const total = BRAND_INDICES.reduce((sum, b) => sum + getTrendChange(b.trend, 1), 0)
    return Number((total / BRAND_INDICES.length).toFixed(1))
  }, [])

  const marketSentiment = useMemo(() => {
    const positiveCount = BRAND_INDICES.filter(b => getTrendChange(b.trend, 1) > 0).length
    if (positiveCount >= 5) return { type: 'bull', color: '#5E8C6A', label: 'BULL 🐂' }
    if (positiveCount >= 3) return { type: 'neutral', color: '#C9A84C', label: 'NEUTRAL —' }
    return { type: 'bear', color: '#A0785A', label: 'BEAR 🐻' }
  }, [])

  const positiveBrandsCount = useMemo(() => {
    return BRAND_INDICES.filter(b => getTrendChange(b.trend, 1) > 0).length
  }, [])

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

    return BRAND_INDICES.map((brandIndex, index) => ({
      key: `brand-${index}`,
      brand: brandIndex.brand,
      trend: brandIndex.trend,
      color: getLineColor(index),
    }))
  }, [])

  const [visibleSentimentBrands, setVisibleSentimentBrands] = useState<string[]>(() =>
    BRAND_INDICES.map((_, index) => `brand-${index}`)
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

  const getAuctionHouseSearchUrl = (auctionHouse: string, query: string): string | null => {
    const normalizedHouse = auctionHouse.toLowerCase()

    if (normalizedHouse.includes("christie")) {
      return `https://www.christies.com/en/results/soldlots/?searchphrase=${encodeURIComponent(query)}`
    }

    if (normalizedHouse.includes("phillips")) {
      return `https://www.phillips.com/search?q=${encodeURIComponent(query)}`
    }

    return null
  }

  const getAuctionDetailUrl = (auction: AuctionResult) => {
    const sourceUrl = auction.sourceUrl?.trim()
    if (sourceUrl) {
      try {
        const parsed = new URL(sourceUrl)
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          return parsed.toString()
        }
      } catch {
        // Fall back to search URL below.
      }
    }

    const normalizeSearchText = (value: unknown) => {
      if (typeof value !== 'string') {
        return ''
      }

      return value
        .replace(/[^a-zA-Z0-9\s'&./-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120)
    }

    const sanitizedHouse = normalizeSearchText(auction.house)
    const sanitizedReference = normalizeSearchText(auction.reference ?? '')
    const sanitizedLot = normalizeSearchText(auction.lot)
    const lotReferenceQuery = `${sanitizedReference} ${sanitizedLot}`.trim()
    const auctionHouseSearchUrl = getAuctionHouseSearchUrl(auction.house, lotReferenceQuery)
    if (auctionHouseSearchUrl) {
      return auctionHouseSearchUrl
    }

    const query = `${sanitizedHouse} ${lotReferenceQuery} auction result`.trim()

    return `https://www.google.com/search?q=${encodeURIComponent(query)}`
  }

  const priceHistoryData = searchReference ? [
    { month: 'Jan', price: 8500 },
    { month: 'Feb', price: 8700 },
    { month: 'Mar', price: 8600 },
    { month: 'Apr', price: 8900 },
    { month: 'May', price: 9200 },
    { month: 'Jun', price: 9400 },
    { month: 'Jul', price: 9600 },
    { month: 'Aug', price: 9500 },
    { month: 'Sep', price: 9800 },
    { month: 'Oct', price: 10100 },
    { month: 'Nov', price: 10300 },
    { month: 'Dec', price: 10500 }
  ] : []

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Market Intelligence</h1>
        <p className="text-muted-foreground text-sm md:text-base mt-1">Real-time market indices and price trends</p>
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
              <div className="text-sm font-medium">{positiveBrandsCount}/{BRAND_INDICES.length} brands positive</div>
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

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rolex Index</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{BRAND_INDICES[0].currentIndex}</div>
            <div className="flex items-center gap-1 mt-1">
              {getTrendChange(BRAND_INDICES[0].trend, 1) >= 0 ? <TrendUp className="text-success" size={14} /> : <TrendDown className="text-destructive" size={14} />}
              <span className={getTrendChange(BRAND_INDICES[0].trend, 1) >= 0 ? 'text-xs text-success' : 'text-xs text-destructive'}>{formatTrend(getTrendChange(BRAND_INDICES[0].trend, 1))} (1m)</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Patek Index</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{BRAND_INDICES[1].currentIndex}</div>
            <div className="flex items-center gap-1 mt-1">
              {getTrendChange(BRAND_INDICES[1].trend, 1) >= 0 ? <TrendUp className="text-success" size={14} /> : <TrendDown className="text-destructive" size={14} />}
              <span className={getTrendChange(BRAND_INDICES[1].trend, 1) >= 0 ? 'text-xs text-success' : 'text-xs text-destructive'}>{formatTrend(getTrendChange(BRAND_INDICES[1].trend, 1))} (1m)</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">AP Index</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{BRAND_INDICES[2].currentIndex}</div>
            <div className="flex items-center gap-1 mt-1">
              {getTrendChange(BRAND_INDICES[2].trend, 1) >= 0 ? <TrendUp className="text-success" size={14} /> : <TrendDown className="text-destructive" size={14} />}
              <span className={getTrendChange(BRAND_INDICES[2].trend, 1) >= 0 ? 'text-xs text-success' : 'text-xs text-destructive'}>{formatTrend(getTrendChange(BRAND_INDICES[2].trend, 1))} (1m)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BRAND_INDICES.map((brandIndex) => {
          const isOwned = userBrands.has(brandIndex.brand)
          const oneMonthChange = getTrendChange(brandIndex.trend, 1)
          const sixMonthChange = getTrendChange(brandIndex.trend, 6)
          const twelveMonthChange = getTrendChange(brandIndex.trend, brandIndex.trend.length - 1)
          const trendMetrics = [
            { label: '1M', change: oneMonthChange, description: 'vs last month' },
            { label: '6M', change: sixMonthChange, description: 'vs 6 months ago' },
            { label: '12M', change: twelveMonthChange, description: 'vs 12 months ago' }
          ]

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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {trendMetrics.map((metric) => {
                    const isPositive = metric.change >= 0
                    return (
                      <div
                        key={metric.label}
                        className={`rounded-xl border px-3 py-4 transition-colors ${getTrendMetricCardClass(metric.change)}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium tracking-[0.03em] text-muted-foreground">
                            {metric.label}
                          </div>
                          {isPositive ? (
                            <TrendUp aria-label="Positive trend" className="text-success" size={18} weight="bold" />
                          ) : (
                            <TrendDown aria-label="Negative trend" className="text-destructive" size={18} weight="bold" />
                          )}
                        </div>
                        <div className={`mt-3 text-2xl font-semibold tabular-nums ${getTrendDirectionColor(metric.change)}`}>
                          {formatTrend(metric.change)}
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
          <CardTitle>Top Movers (30d Change %)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {TOP_MOVERS.map((mover, idx) => (
              <div key={idx} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div className="flex items-center gap-3 flex-1">
                  {mover.direction === 'up' ? (
                    <TrendUp style={{ color: '#5E8C6A' }} size={20} />
                  ) : (
                    <TrendDown style={{ color: '#A0785A' }} size={20} />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{mover.reference}</div>
                    <div className="text-sm text-muted-foreground">{mover.brand}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">${mover.currentPrice.toLocaleString()}</div>
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
                  <div className="font-medium mb-1">Rolex Submariner {searchReference}</div>
                  <div className="text-2xl font-semibold text-primary mb-2 tabular-nums">$10,500</div>
                  <div className="text-sm text-muted-foreground">Last updated: 2 hours ago</div>
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
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex items-start justify-between p-3 border border-border rounded-lg bg-muted/10">
                    <div className="flex-1">
                      <div className="font-medium">{alert.brand} {alert.model}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Alert when price goes {alert.condition} <span className="font-semibold tabular-nums">${alert.targetPrice.toLocaleString()}</span>
                      </div>
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
                ))}
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
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Reference</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Lot</th>
                  <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Result</th>
                  <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Est.</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Performance</th>
                  <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">View</th>
                </tr>
              </thead>
              <tbody>
                {auctionResults.map((auction, idx) => {
                  const hasEstimate = typeof auction.estLow === 'number' && typeof auction.estHigh === 'number'
                  const aboveEstimate = hasEstimate && auction.result > (auction.estHigh ?? 0)
                  const withinEstimate = hasEstimate && !aboveEstimate && auction.result >= (auction.estLow ?? 0)
                  const resultColor = aboveEstimate ? '#5E8C6A' : withinEstimate ? '#C9A84C' : 'inherit'
                  const performanceLabel = getEstimatePerformanceLabel(hasEstimate, aboveEstimate, withinEstimate)

                  return (
                    <tr key={idx} className="border-b border-border last:border-0">
                      <td className="py-3 px-2 text-sm">{auction.house}</td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">{formatAuctionDate(auction.date)}</td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">{auction.reference || '—'}</td>
                      <td className="py-3 px-2 text-sm">{auction.lot}</td>
                      <td className="py-3 px-2 text-sm text-right font-bold tabular-nums" style={{ color: resultColor }}>
                        ${auction.result.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-sm text-right text-muted-foreground tabular-nums">
                        {hasEstimate
                          ? `$${(auction.estLow ?? 0).toLocaleString()}–$${(auction.estHigh ?? 0).toLocaleString()}`
                          : '—'}
                      </td>
                      <td className="py-3 px-2 text-sm">
                        <Badge variant="outline">{performanceLabel}</Badge>
                      </td>
                      <td className="py-3 px-2 text-sm text-right">
                        <Button asChild variant="link" size="sm" className="h-auto p-0">
                          <a href={getAuctionDetailUrl(auction)} target="_blank" rel="noopener noreferrer">
                            View
                          </a>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
            Sources: {auctionResultsDataSource === 'live' ? 'Live Phillips/Christie’s feeds' : 'Fallback cached data'}.
            {' '}Each row includes a direct auction/result link when available.
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
                <Label htmlFor="alert-price">Target Price ($)</Label>
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
