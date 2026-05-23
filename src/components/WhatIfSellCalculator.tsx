import { useEffect, useMemo, useState } from "react"
import { Watch } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { CaretDown, CaretUp, Lightbulb } from "@phosphor-icons/react"
import { DailyLimitError, callAI, createAICacheKey, hashAIInput } from "@/lib/ai/caller"
import { formatCurrency } from "@/lib/currency"

interface WhatIfSellCalculatorProps {
  watches: Watch[]
  getMockMarketValue: (watch: Watch) => number
  calculateHealthScore: (watches: Watch[]) => number
  preferredCurrency?: string
}

export function WhatIfSellCalculator({ watches, getMockMarketValue, calculateHealthScore, preferredCurrency = "USD" }: WhatIfSellCalculatorProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedWatchId, setSelectedWatchId] = useState<string>("")
  const [salePrice, setSalePrice] = useState<number>(0)
  const [llmSuggestion, setLlmSuggestion] = useState<string>("")
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false)

  const selectedWatch = useMemo(() => {
    return watches.find(w => w.id === selectedWatchId)
  }, [watches, selectedWatchId])

  const currentMarketValue = useMemo(() => {
    if (!selectedWatch) return 0
    return getMockMarketValue(selectedWatch)
  }, [selectedWatch, getMockMarketValue])

  const sliderMin = Math.round(currentMarketValue * 0.7)
  const sliderMax = Math.round(currentMarketValue * 1.3)

  useEffect(() => {
    if (selectedWatch) {
      setSalePrice((currentPrice) => currentPrice === 0 ? currentMarketValue : currentPrice)
    }
  }, [currentMarketValue, selectedWatch])

  const currentMetrics = useMemo(() => {
    const watchesWithValues = watches.map(w => ({
      ...w,
      marketValue: getMockMarketValue(w)
    }))
    
    const totalValue = watchesWithValues.reduce((sum, w) => sum + w.marketValue, 0)
    const totalCost = watches.reduce((sum, w) => sum + w.purchasePrice, 0)
    const overallROI = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0
    const brands = new Set(watches.map(w => w.brand))
    const healthScore = calculateHealthScore(watches)

    return {
      totalValue,
      totalCost,
      overallROI,
      numBrands: brands.size,
      healthScore
    }
  }, [watches, getMockMarketValue, calculateHealthScore])

  const afterSaleMetrics = useMemo(() => {
    if (!selectedWatch) return null

    const remainingWatches = watches.filter(w => w.id !== selectedWatchId)
    const watchesWithValues = remainingWatches.map(w => ({
      ...w,
      marketValue: getMockMarketValue(w)
    }))
    
    const totalValue = watchesWithValues.reduce((sum, w) => sum + w.marketValue, 0)
    const totalCost = remainingWatches.reduce((sum, w) => sum + w.purchasePrice, 0)
    const overallROI = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0
    const brands = new Set(remainingWatches.map(w => w.brand))
    const healthScore = calculateHealthScore(remainingWatches)

    const watchesOfSameBrand = watches.filter(w => w.brand === selectedWatch.brand)
    const isLastOfBrand = watchesOfSameBrand.length === 1

    return {
      totalValue,
      totalCost,
      overallROI,
      numBrands: brands.size,
      healthScore,
      isLastOfBrand
    }
  }, [watches, selectedWatch, selectedWatchId, getMockMarketValue, calculateHealthScore])

  const netProceeds = useMemo(() => {
    if (!selectedWatch) return null

    const gain = salePrice - selectedWatch.purchasePrice
    const tax = gain > 0 ? Math.round(gain * 0.28) : 0
    const netAfterTax = salePrice - tax

    return {
      salePrice,
      purchasePrice: selectedWatch.purchasePrice,
      gain,
      tax,
      netAfterTax
    }
  }, [selectedWatch, salePrice])

  const handleWatchSelect = (watchId: string) => {
    setSelectedWatchId(watchId)
    setLlmSuggestion("")
    const watch = watches.find(w => w.id === watchId)
    if (watch) {
      const marketValue = getMockMarketValue(watch)
      setSalePrice(marketValue)
    }
  }

  const handleGenerateSuggestion = async () => {
    if (!selectedWatch || !netProceeds) return

    setIsLoadingSuggestion(true)
    try {
      const remainingWatches = watches.filter(w => w.id !== selectedWatchId)
      const collectionSummary = remainingWatches.length > 0
        ? remainingWatches.map(w => `${w.brand} ${w.model}`).join(', ')
        : 'empty (no remaining watches)'

      const promptText = `You are a luxury watch investment advisor. The user is selling a ${selectedWatch.brand} ${selectedWatch.model} and will receive approximately ${formatCurrency(netProceeds.netAfterTax, preferredCurrency)} in net proceeds after tax. Their remaining collection after the sale: ${collectionSummary}. In 3-4 sentences, suggest how they might redeploy these proceeds within the watch market to improve diversification, returns, or collection quality. Be specific about watch categories or references worth considering. Do not give generic advice.`

      const response = await callAI({
        prompt: promptText,
        taskType: 'what_if',
        cacheKey: createAICacheKey(
          'what-if-sell',
          selectedWatch.id,
          hashAIInput(`${preferredCurrency}|${netProceeds.netAfterTax}|${collectionSummary}`),
        ),
        cacheTtlSeconds: 60 * 60 * 12,
      })
      setLlmSuggestion(response)
    } catch (error) {
      if (error instanceof DailyLimitError) {
        setLlmSuggestion("The daily AI limit has been reached. As a fallback, prioritize replacing the sold watch with a brand or category missing from the remaining collection so diversification improves instead of shrinking.")
      } else {
        setLlmSuggestion("Unable to generate suggestion at this time. Please try again.")
      }
    } finally {
      setIsLoadingSuggestion(false)
    }
  }

  const getChangeColor = (current: number, after: number, higherIsBetter: boolean = true) => {
    const change = after - current
    if (Math.abs(change) < 0.01) return 'text-muted-foreground'
    
    if (higherIsBetter) {
      return change > 0 ? 'text-success' : 'text-destructive'
    } else {
      return change < 0 ? 'text-success' : 'text-destructive'
    }
  }

  const formatChange = (current: number, after: number, isPercent: boolean = false, isDollar: boolean = false) => {
    const change = after - current
    const sign = change > 0 ? '+' : change < 0 ? '-' : ''
    
    if (isDollar) {
      return `${sign}${formatCurrency(Math.abs(change), preferredCurrency)}`
    }
    if (isPercent) {
      return `${sign}${change.toFixed(1)}pp`
    }
    return `${sign}${change}`
  }

  if (!isExpanded) {
    return (
      <Card className="bg-card border-border">
        <CardHeader 
          className="cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setIsExpanded(true)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">What If I Sell?</CardTitle>
            <CaretDown size={24} className="text-muted-foreground" />
          </div>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader 
        className="cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(false)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">What If I Sell?</CardTitle>
          <CaretUp size={24} className="text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Select Watch to Sell
          </label>
          <Select value={selectedWatchId} onValueChange={handleWatchSelect}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a watch from your collection..." />
            </SelectTrigger>
            <SelectContent>
              {watches.map((watch) => {
                const marketValue = getMockMarketValue(watch)
                return (
                  <SelectItem key={watch.id} value={watch.id}>
                    {watch.brand} {watch.model} — {watch.referenceNumber || 'N/A'} (Current: {formatCurrency(marketValue, preferredCurrency)})
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {selectedWatch && afterSaleMetrics && (
          <>
            <div>
              <h3 className="text-lg font-semibold mb-3">Instant Impact Preview</h3>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">Current Portfolio</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">After Selling {selectedWatch.brand} {selectedWatch.model}</p>
                </div>
              </div>
              
              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Total Portfolio Value</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(currentMetrics.totalValue, preferredCurrency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(afterSaleMetrics.totalValue, preferredCurrency)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${getChangeColor(currentMetrics.totalValue, afterSaleMetrics.totalValue)}`}>
                        {formatChange(currentMetrics.totalValue, afterSaleMetrics.totalValue, false, true)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Total Cost Basis</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(currentMetrics.totalCost, preferredCurrency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(afterSaleMetrics.totalCost, preferredCurrency)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${getChangeColor(currentMetrics.totalCost, afterSaleMetrics.totalCost, false)}`}>
                        {formatChange(currentMetrics.totalCost, afterSaleMetrics.totalCost, false, true)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Overall ROI</TableCell>
                      <TableCell className="text-right tabular-nums">{currentMetrics.overallROI >= 0 ? '+' : ''}{currentMetrics.overallROI.toFixed(1)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{afterSaleMetrics.overallROI >= 0 ? '+' : ''}{afterSaleMetrics.overallROI.toFixed(1)}%</TableCell>
                      <TableCell className={`text-right tabular-nums ${getChangeColor(currentMetrics.overallROI, afterSaleMetrics.overallROI)}`}>
                        {formatChange(currentMetrics.overallROI, afterSaleMetrics.overallROI, true)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">No. of Brands</TableCell>
                      <TableCell className="text-right tabular-nums">{currentMetrics.numBrands}</TableCell>
                      <TableCell className="text-right tabular-nums">{afterSaleMetrics.numBrands}</TableCell>
                      <TableCell className={`text-right tabular-nums ${getChangeColor(currentMetrics.numBrands, afterSaleMetrics.numBrands)}`}>
                        {formatChange(currentMetrics.numBrands, afterSaleMetrics.numBrands)} {afterSaleMetrics.isLastOfBrand ? '(last of brand)' : ''}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Collection Health Score</TableCell>
                      <TableCell className="text-right tabular-nums">{currentMetrics.healthScore}/100</TableCell>
                      <TableCell className="text-right tabular-nums">{afterSaleMetrics.healthScore}/100</TableCell>
                      <TableCell className={`text-right tabular-nums ${getChangeColor(currentMetrics.healthScore, afterSaleMetrics.healthScore)}`}>
                        {formatChange(currentMetrics.healthScore, afterSaleMetrics.healthScore)} pts
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Sale Price Estimator</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-3 block">
                    Expected Sale Price
                  </label>
                  <div className="text-4xl font-bold text-primary tabular-nums text-center mb-4">
                    {formatCurrency(salePrice, preferredCurrency)}
                  </div>
                  <Slider
                    value={[salePrice]}
                    onValueChange={(values) => setSalePrice(values[0])}
                    min={sliderMin}
                    max={sliderMax}
                    step={100}
                    className="mb-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Distressed: {formatCurrency(sliderMin, preferredCurrency)}</span>
                    <span>Market: {formatCurrency(currentMarketValue, preferredCurrency)}</span>
                    <span>Premium: {formatCurrency(sliderMax, preferredCurrency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {netProceeds && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Net Proceeds Breakdown</h3>
                <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sale Price</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(netProceeds.salePrice, preferredCurrency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Original Purchase Price</span>
                    <span className="font-semibold tabular-nums text-destructive">-{formatCurrency(netProceeds.purchasePrice, preferredCurrency)}</span>
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between">
                    <span className="text-muted-foreground">Estimated Capital Gain/Loss</span>
                    <span className={`font-semibold tabular-nums ${netProceeds.gain >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {netProceeds.gain >= 0 ? '+' : '-'}{formatCurrency(Math.abs(netProceeds.gain), preferredCurrency)}
                    </span>
                  </div>
                  {netProceeds.tax > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Estimated Tax (28% collectibles rate)</span>
                      <span className="font-semibold tabular-nums text-destructive">-{formatCurrency(netProceeds.tax, preferredCurrency)}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2 flex justify-between">
                    <span className="font-semibold">Net After-Tax Proceeds</span>
                    <span className="font-bold text-lg tabular-nums text-primary">{formatCurrency(netProceeds.netAfterTax, preferredCurrency)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground italic mt-3">
                    Note: US collectibles long-term CGT rate (28%) applied. Consult your tax advisor.
                  </p>
                </div>
              </div>
            )}

            <div>
              <Button 
                onClick={handleGenerateSuggestion}
                disabled={isLoadingSuggestion}
                className="w-full"
                size="lg"
              >
                <Lightbulb className="mr-2" size={20} weight="fill" />
                {isLoadingSuggestion ? 'Generating suggestions...' : 'What should I do with the proceeds?'}
              </Button>

              {llmSuggestion && (
                <div className="mt-4 p-4 bg-muted/30 border-2 border-primary/50 rounded-lg">
                  <p className="text-sm leading-relaxed">{llmSuggestion}</p>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
