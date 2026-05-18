import { Watch } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface PortfolioModuleProps {
  watches: Watch[]
}

export function PortfolioModule({ watches }: PortfolioModuleProps) {
  const totalValue = watches.reduce((sum, w) => sum + (w.currentValue || w.purchasePrice), 0)
  const totalCost = watches.reduce((sum, w) => sum + w.purchasePrice, 0)
  const totalAppreciation = totalValue - totalCost
  const appreciationPercent = totalCost > 0 ? ((totalAppreciation / totalCost) * 100).toFixed(1) : '0'

  const brandData = watches.reduce((acc, watch) => {
    const existing = acc.find(item => item.brand === watch.brand)
    if (existing) {
      existing.value += (watch.currentValue || watch.purchasePrice)
      existing.count += 1
    } else {
      acc.push({
        brand: watch.brand,
        value: watch.currentValue || watch.purchasePrice,
        count: 1
      })
    }
    return acc
  }, [] as { brand: string; value: number; count: number }[])

  const conditionData = watches.reduce((acc, watch) => {
    const existing = acc.find(item => item.condition === watch.condition)
    if (existing) {
      existing.count += 1
    } else {
      acc.push({
        condition: watch.condition,
        count: 1
      })
    }
    return acc
  }, [] as { condition: string; count: number }[])

  const COLORS = ['#C9A84C', '#8B9EB7', '#5E8C6A', '#E8965A', '#9D7C6D', '#6B8E9F']

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Portfolio Analytics</h1>
        <p className="text-muted-foreground mt-1">Comprehensive insights into your collection</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white/[0.025] border-white/[0.07]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Watches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{watches.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.025] border-white/[0.07]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums text-primary">${totalValue.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.025] border-white/[0.07]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">${totalCost.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.025] border-white/[0.07]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Appreciation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-semibold tabular-nums ${totalAppreciation >= 0 ? 'text-success' : 'text-destructive'}`}>
              {totalAppreciation >= 0 ? '+' : ''}{appreciationPercent}%
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white/[0.025] border-white/[0.07]">
          <CardHeader>
            <CardTitle>Value by Brand</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={brandData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="brand" stroke="#8B9EB7" />
                <YAxis stroke="#8B9EB7" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1b', border: '1px solid rgba(255,255,255,0.1)' }}
                  formatter={(value: number) => `$${value.toLocaleString()}`}
                />
                <Bar dataKey="value" fill="#C9A84C" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.025] border-white/[0.07]">
          <CardHeader>
            <CardTitle>Condition Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={conditionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({condition, percent}) => `${condition}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                  nameKey="condition"
                >
                  {conditionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1b', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/[0.025] border-white/[0.07]">
        <CardHeader>
          <CardTitle>Collection Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {brandData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
                <div>
                  <div className="font-medium">{item.brand}</div>
                  <div className="text-sm text-muted-foreground">{item.count} watch{item.count > 1 ? 'es' : ''}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-primary">${item.value.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">
                    {((item.value / totalValue) * 100).toFixed(1)}% of portfolio
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
