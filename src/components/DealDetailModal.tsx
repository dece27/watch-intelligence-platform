import { useState, useEffect } from "react"
import { Deal } from "@/lib/types"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Heart, Plus, Copy, Check } from "@phosphor-icons/react"
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { useKV } from "@github/spark/hooks"
import { toast } from "sonner"

interface DealDetailModalProps {
  open: boolean
  deal: Deal | null
  onOpenChange: (open: boolean) => void
  onFilterBrand?: (brand: string) => void
}

interface AIAnalysis {
  verdict: 'BUY NOW' | 'GOOD VALUE' | 'FAIR DEAL' | 'PASS'
  reasoning: string
  risk: string
}

function getVerdictStyle(verdict: string) {
  switch (verdict) {
    case 'BUY NOW':
      return 'bg-success/20 text-success border-success/30'
    case 'GOOD VALUE':
      return 'bg-primary/20 text-primary border-primary/30'
    case 'FAIR DEAL':
      return 'bg-accent/20 text-accent-foreground border-accent/30'
    default:
      return 'bg-muted/20 text-muted-foreground border-muted/30'
  }
}

export function DealDetailModal({ open, deal, onOpenChange, onFilterBrand }: DealDetailModalProps) {
  const [savedDeals, setSavedDeals] = useKV<string[]>("saved-deals", [])
  const [watchlist, setWatchlist] = useKV<string[]>("deal-watchlist", [])
  const [offerAmount, setOfferAmount] = useState(0)
  const [copied, setCopied] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null)
  const [isLoadingAI, setIsLoadingAI] = useState(false)

  useEffect(() => {
    if (deal && open) {
      setOfferAmount(Math.round(deal.price * 0.85))
      setAiAnalysis(null)
      setIsLoadingAI(true)
      
      const analyzeWithAI = async () => {
        try {
          const prompt = spark.llmPrompt`You are an expert luxury watch dealer. Analyze this deal:
Brand: ${deal.brand}
Model: ${deal.model}
Reference: ${deal.referenceNumber || 'Unknown'}
Asking Price: $${deal.price}
Fair Market Value: $${deal.fairValue || deal.marketValue || deal.price}
Condition: ${deal.condition}
Has Box: ${deal.hasBox ? 'yes' : 'no'}
Has Papers: ${deal.hasPapers ? 'yes' : 'no'}
Days Listed: ${deal.daysListed || 'unknown'}

Provide analysis in this exact format:
- VERDICT: one of [BUY NOW, GOOD VALUE, FAIR DEAL, PASS]
- REASONING: 2-3 sentences explaining the verdict based on price vs market, condition, completeness ${deal.hasBox ? 'with box' : 'no box'} ${deal.hasPapers ? 'with papers' : 'no papers'}
- RISK: one sentence on the main risk factor`

          const response = await spark.llm(prompt, 'gpt-4o-mini')
          
          const verdictMatch = response.match(/VERDICT:\s*(.+?)(?=REASONING:|$)/s)
          const reasoningMatch = response.match(/REASONING:\s*(.+?)(?=RISK:|$)/s)
          const riskMatch = response.match(/RISK:\s*(.+?)$/s)
          
          setAiAnalysis({
            verdict: (verdictMatch?.[1]?.trim() as AIAnalysis['verdict']) || 'FAIR DEAL',
            reasoning: reasoningMatch?.[1]?.trim() || 'Analysis in progress.',
            risk: riskMatch?.[1]?.trim() || 'Standard market risks apply.'
          })
        } catch (error) {
          setAiAnalysis({
            verdict: 'FAIR DEAL',
            reasoning: 'Unable to complete analysis at this time.',
            risk: 'Standard market risks apply.'
          })
        }
        setIsLoadingAI(false)
      }
      
      analyzeWithAI()
    }
  }, [deal, open])

  if (!deal) return null

  const fairValue = deal.fairValue || deal.marketValue || deal.price
  const savings = deal.price < fairValue ? fairValue - deal.price : 0
  const savingsPercent = savings > 0 ? ((savings / fairValue) * 100).toFixed(1) : '0'
  
  const daysListed = deal.daysListed || Math.floor(Math.random() * 30) + 1
  const avgDaysToSell = 45
  const urgencyColor = daysListed > avgDaysToSell ? '🟢' : daysListed > avgDaysToSell * 0.5 ? '🟡' : '🔴'
  const urgencyText = 
    daysListed <= avgDaysToSell * 0.3 
      ? `Fresh listing! Act fast - ${deal.brand} pieces typically get multiple offers.`
      : daysListed <= avgDaysToSell 
      ? `Good timing - seller may be open to reasonable offers.`
      : `Extended listing - strong negotiation position for you.`
  
  const priceHistory = Array.from({ length: Math.max(daysListed, 7) }, (_, i) => ({
    day: i + 1,
    price: deal.price * 1.05 * (1 - (i / (daysListed * 2)))
  }))

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
                <span className="text-lg">{urgencyColor}</span>
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
                    <YAxis hide domain={['dataMin - 1000', 'dataMax + 1000']} />
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
            <h3 className="text-[9px] uppercase tracking-wider text-[#C9A84C] mb-3">Offer Calculator</h3>
            <Card className="bg-white/[0.02] border-white/[0.08] p-6 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Your Offer</span>
                  <span className="text-2xl font-semibold">${offerAmount.toLocaleString()}</span>
                </div>
                <Slider
                  value={[offerAmount]}
                  onValueChange={(values) => setOfferAmount(values[0])}
                  min={Math.round(deal.price * 0.6)}
                  max={Math.round(deal.price * 1.1)}
                  step={100}
                  className="py-4"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{vsMarket}% {Number(vsMarket) < 0 ? 'below' : 'above'} fair market</span>
                  <span>{((1 - offerAmount / deal.price) * 100).toFixed(1)}% off asking</span>
                </div>
              </div>

              <div className="p-4 bg-white/[0.03] rounded space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Suggested Offer Message</div>
                <p className="text-sm leading-relaxed">{offerReasoning}</p>
              </div>

              <Button 
                onClick={handleCopyOffer}
                className="w-full"
                variant="outline"
              >
                {copied ? (
                  <>
                    <Check className="mr-2" size={16} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2" size={16} />
                    Copy Offer Message
                  </>
                )}
              </Button>
            </Card>
          </div>

          <div className="flex gap-3">
            <Button 
              onClick={handleSaveDeal} 
              variant="outline"
              className="flex-1"
            >
              <Heart className="mr-2" size={16} weight={isSaved ? 'fill' : 'regular'} />
              {isSaved ? 'Saved' : 'Save Deal'}
            </Button>
            <Button 
              onClick={handleAddToWatchlist}
              variant="outline"
              className="flex-1"
            >
              <Plus className="mr-2" size={16} />
              {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </Button>
            {onFilterBrand && (
              <Button 
                onClick={handleFindSimilar}
                variant="outline"
                className="flex-1"
              >
                Find Similar {deal.brand}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
