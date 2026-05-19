import { useMemo, useState } from "react"
import { Watch } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TrendUp, TrendDown } from "@phosphor-icons/react"
import { WhatIfSellCalculator } from "@/components/WhatIfSellCalculator"

interface PortfolioModuleProps {
  watches: Watch[]
}

function getMockMarketValue(watch: Watch): number {
  if (watch.currentValue) return watch.currentValue

  const brandMultipliers: Record<string, number> = {
    'Rolex': 1.15,
    'Patek Philippe': 1.25,
    'Audemars Piguet': 1.20,
    'IWC': 1.08,
    'Omega': 1.05,
    'Cartier': 1.10,
    'Vacheron Constantin': 1.22,
    'A. Lange & Söhne': 1.18,
  }

  const refMultipliers: Record<string, number> = {
    'Daytona': 1.35,
    'Submariner': 1.20,
    'GMT': 1.18,
    'Nautilus': 1.40,
    'Aquanaut': 1.28,
    'Royal Oak': 1.35,
    'Speedmaster': 1.08,
  }

  let multiplier = brandMultipliers[watch.brand] || 1.05
  
  Object.keys(refMultipliers).forEach(ref => {
    if (watch.model.includes(ref)) {
      multiplier = Math.max(multiplier, refMultipliers[ref])
    }
  })

  const yearFactor = watch.year && watch.year >= 2020 ? 1.02 : 0.98
  const conditionFactor = watch.condition === 'mint' ? 1.05 : watch.condition === 'excellent' ? 1.0 : watch.condition === 'good' ? 0.95 : 0.88
  const accessoryFactor = (watch.hasBox && watch.hasPapers) ? 1.05 : (watch.hasBox || watch.hasPapers) ? 1.02 : 0.97

  return Math.round(watch.purchasePrice * multiplier * yearFactor * conditionFactor * accessoryFactor)
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

function calculateHealthScore(watches: Watch[]): number {
  if (watches.length === 0) return 0
  
  const watchesWithValues = watches.map(w => ({
    ...w,
    marketValue: getMockMarketValue(w)
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
  
  const roiScore = Math.max(0, Math.min(100, 50 + roi))
  
  const healthScore = (roiScore * 0.4) + (avgConditionScore * 0.3) + (accessoryScore * 0.15) + (diversificationScore * 0.15)
  
  return Math.round(healthScore)
}

export function PortfolioModule({ watches }: PortfolioModuleProps) {
  const [sortField, setSortField] = useState<'brand' | 'roi' | 'value' | 'holdPeriod'>('roi')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const watchesWithMetrics = useMemo(() => {
    return watches.map(watch => {
      const marketValue = getMockMarketValue(watch)
      const roi = ((marketValue - watch.purchasePrice) / watch.purchasePrice) * 100
      const roiDollar = marketValue - watch.purchasePrice
      const holdPeriod = calculateHoldPeriod(watch.purchaseDate)
      
      return {
        ...watch,
        marketValue,
        roi,
        roiDollar,
        holdPeriod,
        holdPeriodDays: Math.ceil((new Date().getTime() - new Date(watch.purchaseDate).getTime()) / (1000 * 60 * 60 * 24))
      }
    })
  }, [watches])

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
          aVal = a.roi
          bVal = b.roi
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

  const totalValue = watchesWithMetrics.reduce((sum, w) => sum + w.marketValue, 0)
  const totalCost = watchesWithMetrics.reduce((sum, w) => sum + w.purchasePrice, 0)
  const totalReturn = totalValue - totalCost
  const totalReturnPercent = totalCost > 0 ? ((totalReturn / totalCost) * 100) : 0
  const healthScore = calculateHealthScore(watches)

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
    const months = 12
    const data = []
    const now = new Date()
    
    for (let i = months - 1; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthName = monthDate.toLocaleDateString('en-US', { month: 'short' })
      
      const watchesOwnedThen = watchesWithMetrics.filter(w => new Date(w.purchaseDate) <= monthDate)
      const totalValueThen = watchesOwnedThen.reduce((sum, w) => {
        const monthsOwned = (monthDate.getTime() - new Date(w.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 30)
        const appreciationRate = (w.marketValue - w.purchasePrice) / w.purchasePrice
        const valueAtMonth = w.purchasePrice * (1 + (appreciationRate * Math.min(monthsOwned / 12, 1)))
        return sum + valueAtMonth
      }, 0)
      
      data.push({
        month: monthName,
        value: Math.round(totalValueThen)
      })
    }
    
    return data
  }, [watchesWithMetrics])

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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Collection Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums text-primary">${totalValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{watches.length} {watches.length === 1 ? 'watch' : 'watches'}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost Basis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">${totalCost.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Original investment</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Return</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-semibold tabular-nums ${totalReturn >= 0 ? 'text-success' : 'text-destructive'}`}>
              {totalReturn >= 0 ? '+' : ''}${totalReturn.toLocaleString()}
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
                  label={({ brand, percent }) => `${brand}: ${(percent * 100).toFixed(0)}%`}
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
                  formatter={(value: number) => `$${value.toLocaleString()}`}
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
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'oklch(0.04 0 0)', border: '1px solid oklch(1 0 0 / 0.07)', borderRadius: '8px' }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Portfolio Value']}
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
        getMockMarketValue={getMockMarketValue}
        calculateHealthScore={calculateHealthScore}
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
                    <TableCell className="tabular-nums">${watch.purchasePrice.toLocaleString()}</TableCell>
                    <TableCell className="tabular-nums">${watch.marketValue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Badge 
                          variant="outline"
                          className={
                            watch.roi > 20 ? 'bg-primary/10 text-primary border-primary/30' :
                            watch.roi > 0 ? 'bg-success/10 text-success border-success/30' :
                            'bg-destructive/10 text-destructive border-destructive/30'
                          }
                        >
                          {watch.roi > 0 ? <TrendUp className="mr-1" size={14} /> : <TrendDown className="mr-1" size={14} />}
                          {watch.roi >= 0 ? '+' : ''}{watch.roi.toFixed(1)}%
                        </Badge>
                        <span className={`tabular-nums text-sm ${watch.roiDollar >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {watch.roiDollar >= 0 ? '+' : ''}${watch.roiDollar.toLocaleString()}
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
