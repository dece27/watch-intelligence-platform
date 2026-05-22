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
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { toast } from "sonner"

interface MarketModuleProps {
  watches: Watch[]
}

const BRAND_INDICES: BrandIndex[] = [
  {
    brand: 'Rolex',
    currentIndex: 127.5,
    change30d: -0.8,
    change90d: 5.7,
    change180d: 8.2,
    trend: [120, 122, 121, 123, 125, 124, 126, 127, 128, 127, 128, 127.5]
  },
  {
    brand: 'Patek Philippe',
    currentIndex: 142.8,
    change30d: 0.5,
    change90d: 7.2,
    change180d: 12.5,
    trend: [128, 130, 132, 135, 137, 138, 140, 141, 142, 143, 142, 142.8]
  },
  {
    brand: 'Audemars Piguet',
    currentIndex: 135.2,
    change30d: 0.8,
    change90d: 4.3,
    change180d: 9.8,
    trend: [123, 125, 127, 128, 130, 131, 132, 133, 134, 135, 136, 135.2]
  },
  {
    brand: 'IWC',
    currentIndex: 112.7,
    change30d: -1.1,
    change90d: 2.8,
    change180d: 5.5,
    trend: [107, 108, 109, 109, 110, 111, 111, 112, 112, 113, 113, 112.7]
  },
  {
    brand: 'Omega',
    currentIndex: 108.4,
    change30d: -0.4,
    change90d: 1.5,
    change180d: 3.2,
    trend: [105, 105, 106, 106, 107, 107, 108, 108, 108, 109, 108, 108.4]
  },
  {
    brand: 'Grand Seiko',
    currentIndex: 115.9,
    change30d: 1.3,
    change90d: 4.6,
    change180d: 7.3,
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
  { house: 'Phillips Geneva', date: 'Nov 2024', lot: 'Patek Philippe 1518 Stainless Steel', result: 1240000, estLow: 900000, estHigh: 1400000, notes: 'One of 4 known steel examples' },
  { house: 'Christie\'s New York', date: 'Dec 2024', lot: 'Rolex Daytona Paul Newman Ref. 6241', result: 287500, estLow: 200000, estHigh: 300000, notes: 'Original tropical dial, full set' },
  { house: 'Christie\'s Geneva', date: 'Nov 2024', lot: 'Patek Nautilus 5711/1A-018 Tiffany Blue', result: 326000, estLow: 280000, estHigh: 380000, notes: 'Tiffany & Co. exclusive dial' },
  { house: 'Phillips Hong Kong', date: 'Oct 2024', lot: 'AP Royal Oak 15202ST Jumbo A-Series', result: 98000, estLow: 75000, estHigh: 95000, notes: 'Early 38mm "A-series" gen' },
  { house: 'Christie\'s HK', date: 'Nov 2024', lot: 'Rolex Daytona 116500LN Panda', result: 36800, estLow: 30000, estHigh: 40000, notes: 'Full set, last-gen ceramic' },
  { house: 'Phillips New York', date: 'Oct 2024', lot: 'F.P. Journe Tourbillon Souverain', result: 185000, estLow: 150000, estHigh: 200000, notes: 'Titanium case, exceptional mvt' }
]

const AUCTION_FILTER_REFERENCES = ['1518', '6241', '5711', '15202', '116500', 'tourbillon souverain']

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

  const overallChange30d = useMemo(() => {
    const total = BRAND_INDICES.reduce((sum, b) => sum + b.change30d, 0)
    return (total / BRAND_INDICES.length).toFixed(1)
  }, [])

  const marketSentiment = useMemo(() => {
    const positiveCount = BRAND_INDICES.filter(b => b.change30d > 0).length
    if (positiveCount >= 5) return { type: 'bull', color: '#5E8C6A', label: 'BULL 🐂' }
    if (positiveCount >= 3) return { type: 'neutral', color: '#C9A84C', label: 'NEUTRAL —' }
    return { type: 'bear', color: '#A0785A', label: 'BEAR 🐻' }
  }, [])

  const positiveBrandsCount = useMemo(() => {
    return BRAND_INDICES.filter(b => b.change30d > 0).length
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadAuctionResults = async () => {
      setIsAuctionResultsLoading(true)
      try {
        const liveResults = await fetchRecentAuctionResults({ references: AUCTION_FILTER_REFERENCES, limit: 8 })
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
          <div className="flex items-center gap-4">
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
              <div className="text-xs text-muted-foreground">30d Trend</div>
              <div className="text-sm font-medium">{positiveBrandsCount}/{BRAND_INDICES.length} brands positive</div>
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
              <TrendUp className="text-success" size={14} />
              <span className="text-xs text-success">+{overallChange30d}% (30d)</span>
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
              <TrendUp className="text-success" size={14} />
              <span className="text-xs text-success">+{BRAND_INDICES[0].change30d}% (30d)</span>
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
              <TrendUp className="text-success" size={14} />
              <span className="text-xs text-success">+{BRAND_INDICES[1].change30d}% (30d)</span>
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
              <TrendUp className="text-success" size={14} />
              <span className="text-xs text-success">+{BRAND_INDICES[2].change30d}% (30d)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BRAND_INDICES.map((brandIndex) => {
          const isOwned = userBrands.has(brandIndex.brand)
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

                <div className="h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={brandIndex.trend.map((val, idx) => ({ value: val, index: idx }))}>
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="oklch(0.72 0.09 85)" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">30d</div>
                    <div className={brandIndex.change30d >= 0 ? 'text-success' : 'text-destructive'}>
                      {brandIndex.change30d >= 0 ? '+' : ''}{brandIndex.change30d}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">90d</div>
                    <div className={brandIndex.change90d >= 0 ? 'text-success' : 'text-destructive'}>
                      {brandIndex.change90d >= 0 ? '+' : ''}{brandIndex.change90d}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">180d</div>
                    <div className={brandIndex.change180d >= 0 ? 'text-success' : 'text-destructive'}>
                      {brandIndex.change180d >= 0 ? '+' : ''}{brandIndex.change180d}%
                    </div>
                  </div>
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
              Phillips & Christie&apos;s · Filtered Grail References
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
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Lot</th>
                  <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Result</th>
                  <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Est.</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Notes</th>
                </tr>
              </thead>
              <tbody>
                {auctionResults.map((auction, idx) => {
                  const hasEstimate = typeof auction.estLow === 'number' && typeof auction.estHigh === 'number'
                  const aboveEstimate = hasEstimate && auction.result > auction.estHigh
                  const withinEstimate = hasEstimate && auction.result >= auction.estLow && auction.result <= auction.estHigh
                  const resultColor = aboveEstimate ? '#5E8C6A' : withinEstimate ? '#C9A84C' : 'inherit'
                  
                  return (
                    <tr key={idx} className="border-b border-border last:border-0">
                      <td className="py-3 px-2 text-sm">{auction.house}</td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">{auction.date}</td>
                      <td className="py-3 px-2 text-sm">{auction.lot}</td>
                      <td className="py-3 px-2 text-sm text-right font-bold tabular-nums" style={{ color: resultColor }}>
                        ${auction.result.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-sm text-right text-muted-foreground tabular-nums">
                        {hasEstimate
                          ? `$${auction.estLow?.toLocaleString()}–$${auction.estHigh?.toLocaleString()}`
                          : '—'}
                      </td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">{auction.notes}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
            Sources: {auctionResultsDataSource === 'live' ? 'Live Phillips/Christie’s feeds' : 'Fallback cached data'}.
            {' '}Results shown in reported currencies/converted USD where provided.
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
