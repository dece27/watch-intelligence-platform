import { useCallback, useEffect, useMemo, useState } from "react"
import { Watch } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendUp, TrendDown } from "@phosphor-icons/react"
import { WhatIfSellCalculator } from "@/components/WhatIfSellCalculator"
import { watchChartsClient } from "@/lib/watchcharts-client"
import { convertCurrency, formatCurrency } from "@/lib/currency"
import { getPortfolioMarketSnapshots, marketConfidenceLabel, type NormalizedMarketData } from "@/lib/market-data"
import { getEstimatedMarketValue } from "@/lib/watchValue"
import { toast } from "sonner"

const WATCHCHARTS_DEFAULT_CONFIDENCE = 0.95
const HEURISTIC_DEFAULT_CONFIDENCE = 0.45

interface PortfolioModuleProps {
  watches: Watch[]
  onUpdate: (updater: (currentWatches: Watch[]) => Watch[]) => Promise<void>
  preferredCurrency?: string
}

function calculateHoldPeriod(purchaseDate: string): string {
  const purchase = new Date(purchaseDate)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - purchase.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays < 30) return `${diffDays} days`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`
  
  const years = Math.floor(diffDays / 365)
  const months = Math.floor((diffDays % 365) / 30)
  if (months === 0) return `${years} ${years === 1 ? 'year' : 'years'}`
  return `${years}y ${months}m`
}

function calculateHealthScore(watches: Array<Watch & { marketConfidence?: number }>): number {
  if (watches.length === 0) return 0
  
  const watchesWithValues = watches.map(w => ({
    ...w,
    marketValue: getEstimatedMarketValue(w)
  }))
  
  const totalCost = watchesWithValues.reduce((sum, w) => sum + w.purchasePrice, 0)
  const totalValue = watchesWithValues.reduce((sum, w) => sum + w.marketValue, 0)
  const roi = ((totalValue - totalCost) / totalCost) * 100
  
  const avgConditionScore = watchesWithValues.reduce((sum, w) => {
    const scores = { mint: 100, excellent: 85, good: 70, fair: 50 }
    return sum + scores[w.condition]
  }, 0) / watchesWithValues.length
  
  const accessoryScore = watchesWithValues.reduce((sum, w) => {
    if (w.hasBox && w.hasPapers) return sum + 100
    if (w.hasBox || w.hasPapers) return sum + 75
    return sum + 50
  }, 0) / watchesWithValues.length
  
  const brands = new Set(watchesWithValues.map(w => w.brand))
  const diversificationScore = Math.min(brands.size / watchesWithValues.length, 0.5) * 100 * 2
  
  const averageConfidence = watchesWithValues.reduce((sum, watch) => {
    const confidence = typeof watch.marketConfidence === "number" && Number.isFinite(watch.marketConfidence)
      ? Math.max(0.4, Math.min(1, watch.marketConfidence))
      : 0.75
    return sum + confidence
  }, 0) / watchesWithValues.length
  const roiScore = Math.max(0, Math.min(100, 50 + roi)) * averageConfidence
  const confidenceScore = averageConfidence * 100
  
  const healthScore = (roiScore * 0.35) + (avgConditionScore * 0.25) + (accessoryScore * 0.15) + (diversificationScore * 0.1) + (confidenceScore * 0.15)
  
  return Math.round(healthScore)
}

export function PortfolioModule({ watches, onUpdate, preferredCurrency = "USD" }: PortfolioModuleProps) {
  const [sortField, setSortField] = useState<'brand' | 'roi' | 'value' | 'holdPeriod'>('roi')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [marketSnapshots, setMarketSnapshots] = useState<Record<string, NormalizedMarketData>>({})
  const [isRefreshingMarket, setIsRefreshingMarket] = useState(false)
  const watchChartsConfigured = Boolean(import.meta.env.VITE_WATCHCHARTS_API_KEY?.trim())
  const staleThresholdMs = 1000 * 60 * 60 * 24

  useEffect(() => {
    let canceled = false

    const loadSnapshots = async () => {
      if (watches.length === 0) {
        if (!canceled) setMarketSnapshots({})
        return
      }
      const snapshots = await getPortfolioMarketSnapshots(watches)
      if (!canceled) {
        setMarketSnapshots(snapshots)
      }
    }

    void loadSnapshots()

    return () => {
      canceled = true
    }
  }, [watches])

  const staleMarketCount = useMemo(() => {
    const now = Date.now()
    return watches.filter((watch) => {
      if (!watch.marketUpdatedAt) return true
      const parsed = Date.parse(watch.marketUpdatedAt)
      if (!Number.isFinite(parsed)) return true
      return (now - parsed) > staleThresholdMs
    }).length
  }, [watches, staleThresholdMs])

  const handleRefreshMarketValues = useCallback(async () => {
    if (watches.length === 0) return
    if (!watchChartsConfigured) {
      toast.error("WatchCharts API key is not configured.")
      return
    }

    setIsRefreshingMarket(true)
    try {
      const refreshedAt = new Date().toISOString()
      const results = await Promise.allSettled(
        watches.map(async (watch) => ({
          watchId: watch.id,
          value: await watchChartsClient.getMarketValue({
            brand: watch.brand,
            model: watch.model,
            referenceNumber: watch.referenceNumber,
          }),
        })),
      )

      const refreshed = new Map<string, number>()
      for (const result of results) {
        if (result.status !== "fulfilled") continue
        const marketValue = result.value.value
        if (typeof marketValue !== "number" || !Number.isFinite(marketValue) || marketValue <= 0) continue
        refreshed.set(result.value.watchId, Number(marketValue.toFixed(2)))
      }

      if (refreshed.size === 0) {
        toast.warning("No WatchCharts market values were returned.")
        return
      }

      await onUpdate((currentWatches) =>
        currentWatches.map((watch) => {
          const value = refreshed.get(watch.id)
          if (typeof value !== "number") return watch
          return {
            ...watch,
            currentValue: value,
            marketSource: "watchcharts",
            marketConfidence: WATCHCHARTS_DEFAULT_CONFIDENCE,
            marketUpdatedAt: refreshedAt,
          }
        }),
      )

      const failedCount = watches.length - refreshed.size
      if (failedCount > 0) {
        toast.warning(`Updated ${refreshed.size} watch values. ${failedCount} failed or unavailable.`)
      } else {
        toast.success(`Updated market values for ${refreshed.size} watches.`)
      }
    } catch (error) {
      console.error("Failed to refresh market values:", error)
      toast.error("Failed to refresh market values.")
    } finally {
      setIsRefreshingMarket(false)
    }
  }, [onUpdate, watchChartsConfigured, watches])

  const getMarketValue = useCallback((watch: Watch): number => {
    if (typeof watch.currentValue === "number" && Number.isFinite(watch.currentValue) && watch.currentValue > 0) {
      return watch.currentValue
    }
    const snapshot = marketSnapshots[watch.id]
    // Heuristic snapshots are derived approximations and should not override
    // canonical persisted market values during ROI calculations.
    const normalizedSnapshotValue = snapshot && snapshot.source !== "heuristic"
      ? convertCurrency(snapshot.latestPrice, snapshot.currency, "USD")
      : null
    return normalizedSnapshotValue ?? getEstimatedMarketValue(watch)
  }, [marketSnapshots])

  const watchesWithMetrics = useMemo(() => {
    return watches.map(watch => {
      const snapshot = marketSnapshots[watch.id]
      const marketValue = getMarketValue(watch)
      const roi = watch.purchasePrice > 0 ? ((marketValue - watch.purchasePrice) / watch.purchasePrice) * 100 : null
      const roiDollar = marketValue - watch.purchasePrice
      const holdPeriod = calculateHoldPeriod(watch.purchaseDate)
      
      return {
        ...watch,
        marketValue,
        roi,
        roiDollar,
        holdPeriod,
        holdPeriodDays: Math.ceil((new Date().getTime() - new Date(watch.purchaseDate).getTime()) / (1000 * 60 * 60 * 24)),
        marketSource: watch.marketSource ?? snapshot?.source ?? "heuristic",
        marketUpdatedAt: watch.marketUpdatedAt ?? snapshot?.updatedAt,
        marketConfidence: watch.marketConfidence ?? snapshot?.confidence ?? HEURISTIC_DEFAULT_CONFIDENCE,
      }
    })
  }, [watches, getMarketValue, marketSnapshots])

  const sortedWatches = useMemo(() => {
    return [...watchesWithMetrics].sort((a, b) => {
      let aVal: number | string = 0
      let bVal: number | string = 0
      
      switch (sortField) {
        case 'brand':
          aVal = a.brand
          bVal = b.brand
          break
        case 'roi':
          aVal = a.roi ?? Number.NEGATIVE_INFINITY
          bVal = b.roi ?? Number.NEGATIVE_INFINITY
          break
        case 'value':
          aVal = a.marketValue
          bVal = b.marketValue
          break
        case 'holdPeriod':
          aVal = a.holdPeriodDays
          bVal = b.holdPeriodDays
          break
      }
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      
      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })
  }, [watchesWithMetrics, sortField, sortDirection])

  const { totalValue, totalCost, totalReturn, totalReturnPercent } = useMemo(() => {
    const value = watchesWithMetrics.reduce((sum, w) => sum + w.marketValue, 0)
    const cost = watchesWithMetrics.reduce((sum, w) => sum + w.purchasePrice, 0)
    const ret = value - cost
    return {
      totalValue: value,
      totalCost: cost,
      totalReturn: ret,
      totalReturnPercent: cost > 0 ? (ret / cost) * 100 : 0,
    }
  }, [watchesWithMetrics])
  const portfolioMarketMetadata = useMemo(() => {
    const watchesWithMarket = watchesWithMetrics.filter((watch) => watch.marketSource)
    if (watchesWithMarket.length === 0) {
      return { source: "heuristic", updatedAt: null as string | null, confidence: "low" as const }
    }
    const sourceCounts = watchesWithMarket.reduce<Record<string, number>>((acc, watch) => {
      const source = watch.marketSource || "heuristic"
      acc[source] = (acc[source] || 0) + 1
      return acc
    }, {})
    const source = Object.entries(sourceCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || "heuristic"
    const updatedAt = watchesWithMarket.reduce<string | null>((latest, watch) => {
      if (!watch.marketUpdatedAt) return latest
      if (!latest) return watch.marketUpdatedAt
      return Date.parse(watch.marketUpdatedAt) > Date.parse(latest) ? watch.marketUpdatedAt : latest
    }, null)
    const confidence = marketConfidenceLabel(
      watchesWithMarket.reduce((sum, watch) => sum + (watch.marketConfidence ?? HEURISTIC_DEFAULT_CONFIDENCE), 0) / watchesWithMarket.length
    )
    return { source, updatedAt, confidence }
  }, [watchesWithMetrics])
  const healthScore = useMemo(() => calculateHealthScore(
    watchesWithMetrics.map(({ marketValue, ...watch }) => ({ ...watch, currentValue: marketValue }))
  ), [watchesWithMetrics])

  const brandData = useMemo(() => {
    const brandMap = watchesWithMetrics.reduce((acc, watch) => {
      if (!acc[watch.brand]) {
        acc[watch.brand] = { brand: watch.brand, value: 0, count: 0 }
      }
      acc[watch.brand].value += watch.marketValue
      acc[watch.brand].count += 1
      return acc
    }, {} as Record<string, { brand: string; value: number; count: number }>)
    
    return Object.values(brandMap).sort((a, b) => b.value - a.value)
  }, [watchesWithMetrics])

  const trendData = useMemo(() => {
    const monthLabels = Array.from({ length: 12 }, (_, idx) => {
      const monthDate = new Date()
      monthDate.setMonth(monthDate.getMonth() - (11 - idx))
      return monthDate.toLocaleDateString('en-US', { month: 'short' })
    })

    return monthLabels.map((monthLabel, monthIndex) => {
      const totalValueThen = watchesWithMetrics.reduce((sum, watch) => {
        const snapshotSeriesValue = marketSnapshots[watch.id]?.series12m[monthIndex]?.price
        const snapshotCurrency = marketSnapshots[watch.id]?.currency || "USD"
        const value = typeof snapshotSeriesValue === "number" && Number.isFinite(snapshotSeriesValue) && snapshotSeriesValue > 0
          ? convertCurrency(snapshotSeriesValue, snapshotCurrency, "USD")
          : watch.marketValue
        return sum + value
      }, 0)

      return {
        month: monthLabel,
        value: Math.round(totalValueThen),
      }
    })
  }, [marketSnapshots, watchesWithMetrics])

  const COLORS = ['#C9A84C', '#8B9EB7', '#5E8C6A', '#A0785A', '#9D7C6D', '#6B8E9F', '#E8965A', '#7A9D7E']

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  if (watches.length === 0) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Portfolio Analytics</h1>
          <p className="text-muted-foreground text-sm md:text-base mt-1">Comprehensive insights into your collection</p>
        </div>
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="mb-2">No watches in collection</p>
            <p className="text-sm">Add watches to see portfolio analytics</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Portfolio Analytics</h1>
        <p className="text-muted-foreground text-sm md:text-base mt-1">Comprehensive insights into your collection</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            onClick={() => void handleRefreshMarketValues()}
            disabled={isRefreshingMarket || !watchChartsConfigured}
          >
            {isRefreshingMarket ? "Refreshing..." : "Refresh WatchCharts Values"}
          </Button>
          {!watchChartsConfigured ? (
            <span className="text-xs text-muted-foreground">
              Configure <code>VITE_WATCHCHARTS_API_KEY</code> to refresh canonical market values.
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {staleMarketCount === 0
                ? "All persisted market values refreshed in the last 24 hours."
                : `${staleMarketCount} watch${staleMarketCount === 1 ? "" : "es"} have stale or missing market values.`}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Collection Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums text-primary">{formatCurrency(totalValue, preferredCurrency)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {watches.length} {watches.length === 1 ? 'watch' : 'watches'} · {portfolioMarketMetadata.source} · {portfolioMarketMetadata.updatedAt ? new Date(portfolioMarketMetadata.updatedAt).toLocaleDateString() : 'n/a'} · {portfolioMarketMetadata.confidence}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost Basis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{formatCurrency(totalCost, preferredCurrency)}</div>
            <p className="text-xs text-muted-foreground mt-1">Original investment</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Return</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-semibold tabular-nums ${totalReturn >= 0 ? 'text-success' : 'text-destructive'}`}>
              {totalReturn >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totalReturn), preferredCurrency)}
            </div>
            <p className={`text-xs mt-1 ${totalReturnPercent >= 0 ? 'text-success' : 'text-destructive'}`}>
              {totalReturnPercent >= 0 ? '+' : ''}{totalReturnPercent.toFixed(1)}%
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Collection Health Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums text-primary">{healthScore}</div>
            <p className="text-xs text-muted-foreground mt-1">Out of 100</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Brand Diversification</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={brandData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ payload, percent }) => {
                    const brand = typeof payload === "object" && payload !== null && "brand" in payload
                      ? String((payload as { brand?: unknown }).brand ?? "Unknown")
                      : "Unknown"
                    const safePercent = typeof percent === "number" ? percent : 0
                    return `${brand}: ${(safePercent * 100).toFixed(0)}%`
                  }}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="brand"
                >
                  {brandData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'oklch(0.04 0 0)', border: '1px solid oklch(1 0 0 / 0.07)', borderRadius: '8px' }}
                  formatter={(value: number) => formatCurrency(value, preferredCurrency)}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>12-Month Portfolio Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <XAxis 
                  dataKey="month" 
                  stroke="oklch(0.65 0.025 240)" 
                  style={{ fontSize: '12px' }}
                />
                <YAxis 
                  stroke="oklch(0.65 0.025 240)" 
                  style={{ fontSize: '12px' }}
                  tickFormatter={(value) => formatCurrency(value, preferredCurrency, { notation: "compact" })}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'oklch(0.04 0 0)', border: '1px solid oklch(1 0 0 / 0.07)', borderRadius: '8px' }}
                  formatter={(value: number) => [formatCurrency(value, preferredCurrency), 'Portfolio Value']}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="oklch(0.72 0.09 85)" 
                  strokeWidth={2}
                  dot={{ fill: 'oklch(0.72 0.09 85)', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <WhatIfSellCalculator 
        watches={watches}
        getMockMarketValue={getMarketValue}
        calculateHealthScore={calculateHealthScore}
        preferredCurrency={preferredCurrency}
      />

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Per-Watch ROI Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground"
                    onClick={() => handleSort('brand')}
                  >
                    Watch {sortField === 'brand' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead>Purchase Price</TableHead>
                  <TableHead>Current Value</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground text-right"
                    onClick={() => handleSort('roi')}
                  >
                    ROI {sortField === 'roi' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground text-right"
                    onClick={() => handleSort('holdPeriod')}
                  >
                    Hold Period {sortField === 'holdPeriod' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedWatches.map((watch) => (
                  <TableRow key={watch.id}>
                    <TableCell>
                      <div className="font-medium">{watch.brand}</div>
                      <div className="text-sm text-muted-foreground">{watch.model}</div>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatCurrency(watch.purchasePrice, preferredCurrency)}</TableCell>
                    <TableCell className="tabular-nums">
                      <div>{formatCurrency(watch.marketValue, preferredCurrency)}</div>
                      <div className="text-xs text-muted-foreground">
                        Source: {watch.marketSource || 'heuristic'} · {watch.marketUpdatedAt ? new Date(watch.marketUpdatedAt).toLocaleDateString() : 'n/a'} · {marketConfidenceLabel(watch.marketConfidence ?? HEURISTIC_DEFAULT_CONFIDENCE)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Badge 
                          variant="outline"
                          className={
                            watch.roi === null ? 'bg-muted/50 text-muted-foreground border-border' :
                            watch.roi > 20 ? 'bg-primary/10 text-primary border-primary/30' :
                            watch.roi > 0 ? 'bg-success/10 text-success border-success/30' :
                            'bg-destructive/10 text-destructive border-destructive/30'
                          }
                        >
                          {watch.roi === null ? null : watch.roi > 0 ? <TrendUp className="mr-1" size={14} /> : <TrendDown className="mr-1" size={14} />}
                          {watch.roi === null ? 'n/a' : `${watch.roi >= 0 ? '+' : ''}${watch.roi.toFixed(1)}%`}
                        </Badge>
                        <span className={`tabular-nums text-sm ${watch.roiDollar >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {watch.roiDollar >= 0 ? '+' : '-'}{formatCurrency(Math.abs(watch.roiDollar), preferredCurrency)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{watch.holdPeriod}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
