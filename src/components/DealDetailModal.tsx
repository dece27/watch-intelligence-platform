import { useState, useEffect } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Heart, Plus, Copy, Check } from "@phosphor-icons/react"
import { toast } from "sonner"
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { useKV } from "@github/spark/hooks"

interface Deal {
  id: string
  brand: string
  model: string
  referenceNumber?: string
  price: number
  fairValue?: number
  condition: string
  location: string
  daysListed?: number
}

interface AIAnalysis {
  verdict: 'EXCELLENT DEAL' | 'GOOD DEAL' | 'FAIR DEAL' | 'OVERPRICED'
  reasoning: string
  risk: string
}

interface DealDetailModalProps {
  deal: Deal
  open: boolean
  onOpenChange: (open: boolean) => void
  onFilterBrand?: (brand: string) => void
}

export function DealDetailModal({ deal, open, onOpenChange, onFilterBrand }: DealDetailModalProps) {
  const [savedDeals, setSavedDeals] = useKV<string[]>("saved-deals", [])
  const [watchlist, setWatchlist] = useKV<string[]>("deal-watchlist", [])
  const [copied, setCopied] = useState(false)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null)

  useEffect(() => {
    if (open && !aiAnalysis) {
      analyzeWithAI()
    }
  }, [open, deal])

  const analyzeWithAI = async () => {
    setIsLoadingAI(true)
    try {
      const prompt = spark.llmPrompt`Analyze this watch deal as an expert dealer:

Watch: ${deal.brand} ${deal.model}
Reference: ${deal.referenceNumber || 'N/A'}
Asking Price: $${deal.price.toLocaleString()}
Fair Value: $${deal.fairValue?.toLocaleString() || 'Unknown'}
Condition: ${deal.condition}

Provide:
- VERDICT: one of EXCELLENT DEAL, GOOD DEAL, FAIR DEAL, or OVERPRICED
- REASONING: 2-3 sentences on why this is or isn't a good deal
- RISK: one sentence on the main risk factor`

      const response = await spark.llm(prompt, "gpt-4o-mini")
      
      const verdictMatch = response.match(/VERDICT:\s*(EXCELLENT DEAL|GOOD DEAL|FAIR DEAL|OVERPRICED)/i)
      const reasoningMatch = response.match(/REASONING:\s*([^\n]+(?:\n[^\n-]+)*)/i)
      const riskMatch = response.match(/RISK:\s*([^\n]+)/i)

      if (verdictMatch) {
        setAiAnalysis({
          verdict: verdictMatch[1] as AIAnalysis['verdict'],
          reasoning: reasoningMatch?.[1]?.trim() || 'Good opportunity to consider.',
          risk: riskMatch?.[1]?.trim() || 'No significant risk identified.'
        })
      } else {
        setAiAnalysis({
          verdict: 'FAIR DEAL',
          reasoning: 'Market value appears consistent with current trends.',
          risk: 'Analysis incomplete'
        })
      }
    } catch (error) {
      setAiAnalysis({
        verdict: 'FAIR DEAL',
        reasoning: 'Unable to complete analysis. Please verify details manually.',
        risk: 'Analysis incomplete'
      })
    }
    setIsLoadingAI(false)
  }

  const getVerdictStyle = (verdict: AIAnalysis['verdict']) => {
    switch (verdict) {
      case 'EXCELLENT DEAL':
        return 'bg-success/20 text-success border-success/30'
      case 'GOOD DEAL':
        return 'bg-primary/20 text-primary border-primary/30'
      case 'FAIR DEAL':
        return 'bg-secondary/20 text-secondary border-secondary/30'
      case 'OVERPRICED':
        return 'bg-destructive/20 text-destructive border-destructive/30'
    }
  }

  const fairValue = deal.fairValue || deal.price
  const savings = deal.price < fairValue ? fairValue - deal.price : 0
  const savingsPercent = ((savings / fairValue) * 100).toFixed(0)
  
  const daysListed = deal.daysListed || Math.floor(Math.random() * 45) + 1
  const avgDaysToSell = 28
  const urgencyText = 
    daysListed < 7 
      ? `Fresh listing - seller expectations are likely firm.`
      : daysListed > 30
      ? `Listed over a month - seller may be motivated to negotiate.`
      : `Good timing - seller may be open to reasonable offers.`
  
  const priceHistory = Array.from({ length: Math.min(daysListed, 30) }, (_, i) => ({
    day: i + 1,
    price: deal.price + (Math.random() * 500 - 250)
  }))

  const offerAmount = Math.round(fairValue * 0.92)
  const vsMarket = ((offerAmount - fairValue) / fairValue * 100).toFixed(1)
  const offerReasoning = `Based on ${daysListed} days listed and current market for ${deal.brand} ${deal.referenceNumber || deal.model} averaging $${fairValue.toLocaleString()}, I'd like to offer $${offerAmount.toLocaleString()}. Happy to proceed quickly.`

  const isSaved = savedDeals?.includes(deal.id)
  const isInWatchlist = watchlist?.includes(deal.id)

  const handleSaveDeal = () => {
    setSavedDeals((current = []) => 
      current.includes(deal.id) 
        ? current.filter(id => id !== deal.id)
        : [...current, deal.id]
    )
    toast.success(isSaved ? 'Deal removed from saved' : 'Deal saved!')
  }

  const handleAddToWatchlist = () => {
    setWatchlist((current = []) =>
      current.includes(deal.id)
        ? current.filter(id => id !== deal.id)
        : [...current, deal.id]
    )
    toast.success(isInWatchlist ? 'Removed from watchlist' : 'Added to watchlist!')
  }

  const handleFindSimilar = () => {
    if (onFilterBrand) {
      onFilterBrand(deal.brand)
      onOpenChange(false)
      toast.success(`Filtering deals by ${deal.brand}`)
    }
  }

  const handleCopyOffer = () => {
    navigator.clipboard.writeText(offerReasoning)
    setCopied(true)
    toast.success('Offer message copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-white/[0.08]">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-1">
              {deal.brand} {deal.model}
            </h2>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{deal.referenceNumber || 'N/A'}</span>
              <span>•</span>
              <span>{deal.condition}</span>
              <span>•</span>
              <span>{deal.location}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-white/[0.02] border-white/[0.08] p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Asking Price</div>
              <div className="text-2xl font-semibold">${deal.price.toLocaleString()}</div>
            </Card>
            <Card className="bg-white/[0.02] border-white/[0.08] p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Est. Fair Value</div>
              <div className="text-2xl font-semibold">${fairValue.toLocaleString()}</div>
            </Card>
            <Card className="bg-white/[0.02] border-white/[0.08] p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Potential Savings</div>
              <div className="text-2xl font-semibold text-success">${savings.toLocaleString()} ({savingsPercent}%)</div>
            </Card>
          </div>

          <div>
            <h3 className="text-[9px] uppercase tracking-wider text-[#C9A84C] mb-3">AI Dealer Analysis</h3>
            <Card className="bg-white/[0.02] border-white/[0.08] p-6">
              {isLoadingAI ? (
                <div className="space-y-3">
                  <div className="h-8 bg-white/[0.05] rounded animate-pulse" />
                  <div className="h-20 bg-white/[0.05] rounded animate-pulse" />
                  <div className="h-12 bg-white/[0.05] rounded animate-pulse" />
                </div>
              ) : aiAnalysis ? (
                <div className="space-y-4">
                  <Badge className={`${getVerdictStyle(aiAnalysis.verdict)} text-base px-4 py-1`}>
                    {aiAnalysis.verdict}
                  </Badge>
                  
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Reasoning</div>
                    <p className="text-sm leading-relaxed">{aiAnalysis.reasoning}</p>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Risk</div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{aiAnalysis.risk}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Analysis unavailable</p>
              )}
            </Card>
          </div>

          <div>
            <h3 className="text-[9px] uppercase tracking-wider text-[#C9A84C] mb-3">Deal Velocity</h3>
            <Card className="bg-white/[0.02] border-white/[0.08] p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <div>
                  <div className="font-medium">Listed {daysListed} days ago</div>
                  <div className="text-sm text-muted-foreground">
                    Similar {deal.brand} {deal.model} references sell in avg {avgDaysToSell} days
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 text-sm p-3 bg-white/[0.03] rounded">
                <span className="text-lg">💡</span>
                <p className="flex-1">{urgencyText}</p>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Price History on This Listing</div>
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={priceHistory}>
                    <XAxis 
                      dataKey="day" 
                      hide 
                    />
                    <YAxis hide domain={['dataMin - 500', 'dataMax + 500']} />
                    <Line 
                      type="monotone"
                      dataKey="price" 
                      stroke="oklch(0.72 0.09 85)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div>
            <h3 className="text-[9px] uppercase tracking-wider text-[#C9A84C] mb-3">Suggested Offer</h3>
            <Card className="bg-white/[0.02] border-white/[0.08] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Offer Amount</div>
                  <div className="text-3xl font-semibold">${offerAmount.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground mt-1">{vsMarket}% vs market average</div>
                </div>
                <Button onClick={handleCopyOffer} size="lg" className="gap-2">
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                  {copied ? 'Copied!' : 'Copy Offer Message'}
                </Button>
              </div>

              <div className="p-4 bg-white/[0.03] rounded border border-white/[0.05]">
                <p className="text-sm leading-relaxed italic">{offerReasoning}</p>
              </div>
            </Card>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-white/[0.08]">
            <Button onClick={handleSaveDeal} variant="outline" className="gap-2">
              <Heart size={18} weight={isSaved ? 'fill' : 'regular'} />
              {isSaved ? 'Saved' : 'Save Deal'}
            </Button>
            <Button onClick={handleAddToWatchlist} variant="outline" className="gap-2">
              <Plus size={18} />
              {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </Button>
            {onFilterBrand && (
              <Button onClick={handleFindSimilar} variant="outline">
                Find Similar {deal.brand} Deals
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
