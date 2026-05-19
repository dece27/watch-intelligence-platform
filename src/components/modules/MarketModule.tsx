import { useEffect, useMemo, useState } from "react"
import { Watch } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendUp, TrendDown } from "@phosphor-icons/react"
import { watchChartsClient } from "@/lib/watchcharts-client"

interface MarketModuleProps {
  watches: Watch[]
}

export function MarketModule({ watches }: MarketModuleProps) {
  const [marketValues, setMarketValues] = useState<Record<string, number>>({})

  useEffect(() => {
    let canceled = false

    const loadMarketValues = async () => {
      if (watches.length === 0) {
        setMarketValues({})
        return
      }

      const entries = await Promise.all(
        watches.map(async (watch) => {
          try {
            const apiMarketValue = await watchChartsClient.getMarketValue({
              brand: watch.brand,
              model: watch.model,
              referenceNumber: watch.referenceNumber,
            })

            return [watch.id, apiMarketValue ?? watch.currentValue ?? watch.purchasePrice] as const
          } catch {
            return [watch.id, watch.currentValue ?? watch.purchasePrice] as const
          }
        })
      )

      if (!canceled) {
        setMarketValues(Object.fromEntries(entries))
      }
    }

    void loadMarketValues()

    return () => {
      canceled = true
    }
  }, [watches])

  const watchesWithMarketData = useMemo(() => {
    return watches.map((watch) => {
      const marketValue = marketValues[watch.id] ?? watch.currentValue ?? watch.purchasePrice
      const change = marketValue - watch.purchasePrice
      const changePercent = ((change / watch.purchasePrice) * 100).toFixed(1)

      return {
        ...watch,
        marketValue,
        change,
        changePercent: parseFloat(changePercent),
        sentiment: parseFloat(changePercent) > 10 ? "strong" : parseFloat(changePercent) > 0 ? "positive" : "neutral",
      }
    })
  }, [marketValues, watches])

  const topPerformers = [...watchesWithMarketData]
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Market Intelligence</h1>
        <p className="text-muted-foreground mt-1">Track market values and trends</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white/[0.025] border-white/[0.07]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Appreciation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums text-success">
              +{(watchesWithMarketData.reduce((sum, w) => sum + w.changePercent, 0) / watches.length || 0).toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.025] border-white/[0.07]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Strongest Performer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{topPerformers[0]?.brand || 'N/A'}</div>
            <div className="text-sm text-muted-foreground">{topPerformers[0]?.model || ''}</div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.025] border-white/[0.07]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Market Sentiment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold text-success">Bullish</div>
            <div className="text-sm text-muted-foreground">Strong demand across categories</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/[0.025] border-white/[0.07]">
        <CardHeader>
          <CardTitle>Your Watches - Market Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {watchesWithMarketData.map((watch) => (
              <div key={watch.id} className="flex items-center justify-between p-4 rounded-lg bg-white/[0.015] border border-white/[0.05]">
                <div className="flex-1">
                  <div className="font-semibold">{watch.brand} {watch.model}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Purchased: ${watch.purchasePrice.toLocaleString()} • 
                    Market: ${watch.marketValue.toLocaleString()}
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <Badge variant={watch.changePercent >= 0 ? "default" : "destructive"} className="tabular-nums">
                    {watch.changePercent >= 0 ? <TrendUp className="mr-1" size={14} /> : <TrendDown className="mr-1" size={14} />}
                    {watch.changePercent >= 0 ? '+' : ''}{watch.changePercent}%
                  </Badge>
                  <div className={`text-lg font-semibold tabular-nums ${watch.change >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {watch.change >= 0 ? '+' : ''}${watch.change.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.025] border-white/[0.07]">
        <CardHeader>
          <CardTitle>Top Performers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topPerformers.map((watch, idx) => (
              <div key={watch.id} className="flex items-center justify-between py-3 border-b border-white/[0.05] last:border-0">
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-semibold text-primary">#{idx + 1}</div>
                  <div>
                    <div className="font-medium">{watch.brand} {watch.model}</div>
                    <div className="text-sm text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {watch.sentiment === 'strong' ? 'Strong Buy' : watch.sentiment === 'positive' ? 'Buy' : 'Hold'}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-semibold text-success">+{watch.changePercent}%</div>
                  <div className="text-sm text-muted-foreground">+${watch.change.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
