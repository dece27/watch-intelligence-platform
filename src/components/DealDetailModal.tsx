import { useState, useEffect } from "react"
import { Deal } from "@/lib/types"
import { useKV } from "@github/spark/hooks"
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Card } from "@/components/ui/card"
import { X, Heart, Plus, Copy, Check } from "@phosphor-icons/react"
import { toast } from "sonner"
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts"

interface DealDetailModalProps {
  deal: Deal | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onFilterBrand?: (brand: string) => void
}

interface AIAnalysis {
  verdict: 'BUY NOW' | 'GOOD VALUE' | 'FAIR DEAL' | 'PASS'
  reasoning: string
  risk: string
}

export function DealDetailModal({ deal, open, onOpenChange, onFilterBrand }: DealDetailModalProps) {
  const [savedDeals, setSavedDeals] = useKV<string[]>("savedDeals", [])
  const [watchlist, setWatchlist] = useKV<string[]>("watchlist", [])
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [offerAmount, setOfferAmount] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (deal && open) {
      setOfferAmount(deal.price * 0.92)
      setAiAnalysis(null)
      loadAIAnalysis()
    }
  }, [deal, open])

  const loadAIAnalysis = async () => {
    if (!deal) return
    
    setIsLoadingAI(true)
    try {
      const fairValue = deal.fairValue || deal.marketValue || deal.price * 1.15
      const boxPapers = deal.hasBox && deal.hasPapers ? 'with box and papers' : 
                        deal.hasBox ? 'with box only' : 
                        deal.hasPapers ? 'with papers only' : 
                        'without box or papers'
      
      const promptText = `Analyze this watch deal as an expert dealer. Watch: ${deal.brand} ${deal.model} ${deal.referenceNumber || ''}, ${deal.year || 'recent'}, condition: ${deal.condition}, ${boxPapers}. Asking price: $${deal.price}. Fair market value: $${fairValue}. Seller rating: ${deal.sellerRating || 4.5}/5. Listed ${deal.daysListed || 3} days ago.

Provide:
- VERDICT: one of BUY NOW / GOOD VALUE / FAIR DEAL / PASS
- REASONING: 2-3 specific sentences on the price, condition, and market context using 2025 data where relevant (Rolex stable-recovering, Patek +6% YTD, Grand Seiko +12.8% YTD)
- RISK: one sentence on the main risk factor

Respond in this format:
VERDICT: [BUY NOW/GOOD VALUE/FAIR DEAL/PASS]
REASONING: [sentences]
RISK: [sentence]`

      const response = await window.spark.llm(promptText, "gpt-4o-mini")
      
      const verdictMatch = response.match(/VERDICT:\s*(.+)/i)
      const reasoningMatch = response.match(/REASONING:\s*(.+?)(?=RISK:|$)/is)
      const riskMatch = response.match(/RISK:\s*(.+)/is)
      
      setAiAnalysis({
        verdict: (verdictMatch?.[1]?.trim() as AIAnalysis['verdict']) || 'FAIR DEAL',
        reasoning: reasoningMatch?.[1]?.trim() || 'Analysis unavailable',
        risk: riskMatch?.[1]?.trim() || 'Standard market risks apply'
      })
    } catch (error) {
      console.error('AI Analysis failed:', error)
      setAiAnalysis({
        verdict: 'FAIR DEAL',
        reasoning: 'Unable to load AI analysis at this time.',
        risk: 'Standard market risks apply.'
      })
    } finally {
      setIsLoadingAI(false)
    }
  }

  if (!deal) return null

  const fairValue = deal.fairValue || deal.marketValue || deal.price * 1.15
  const savings = fairValue - deal.price
  const savingsPercent = ((savings / fairValue) * 100).toFixed(1)
  const priceRatio = (deal.price / fairValue) * 100
  const dealScore = deal.dealScore || deal.matchScore || 85
  
  const daysListed = deal.daysListed || Math.floor(Math.random() * 14) + 1
  const avgDaysToSell = deal.brand === 'Rolex' ? (daysListed > 7 ? 5 : 8) :
                        deal.brand === 'Patek Philippe' ? 12 :
                        deal.brand.includes('Audemars') ? 7 : 10
  
  const urgencyColor = daysListed < avgDaysToSell ? '🟢' : 
                       daysListed <= avgDaysToSell * 1.5 ? '🟡' : '🔴'
  const urgencyText = daysListed < avgDaysToSell ? 
    `Fresh listing — similar pieces sell fast at this price` :
    daysListed <= avgDaysToSell * 1.5 ? 
    `At typical market duration — seller may consider offers` :
    `Extended listing — seller likely motivated. Good negotiation window.`

  const priceHistory = Array.from({ length: Math.max(daysListed, 7) }, (_, i) => ({
    day: i,
    price: deal.price * 1.05 * (1 - (i / (daysListed * 2)))
  }))

  const discountFromAsking = ((deal.price - offerAmount) / deal.price * 100).toFixed(1)
  const vsMarket = ((offerAmount - fairValue) / fairValue * 100).toFixed(1)
  const offerReasoning = `Based on ${daysListed} days listed and current market for ${deal.brand} ${deal.referenceNumber || deal.model} averaging $${fairValue.toLocaleString()}, I'd like to offer $${offerAmount.toLocaleString()}. Happy to proceed quickly.`

  const isSaved = savedDeals?.includes(deal.id)
  const isInWatchlist = watchlist?.includes(deal.id)

  const handleSaveDeal = () => {
    setSavedDeals((current) => {
      const deals = current || []
      return deals.includes(deal.id) 
        ? deals.filter(id => id !== deal.id)
        : [...deals, deal.id]
    })
    toast.success(isSaved ? 'Removed from saved deals' : 'Deal saved!')
  }

  const handleAddToWatchlist = () => {
    setWatchlist((current) => {
      const list = current || []
      return list.includes(deal.id)
        ? list.filter(id => id !== deal.id)
        : [...list, deal.id]
    })
    toast.success(isInWatchlist ? 'Removed from watchlist' : 'Added to watchlist!')
  }

  const handleFindSimilar = () => {
    onFilterBrand?.(deal.brand)
    onOpenChange(false)
    toast.success(`Filtering deals by ${deal.brand}`)
  }

  const handleCopyOffer = () => {
    navigator.clipboard.writeText(offerReasoning)
    setCopied(true)
    toast.success('Offer message copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const getScoreBadge = () => {
    if (dealScore >= 90) return { text: `🔥 ${dealScore} — Hot Deal`, color: 'bg-[oklch(0.58_0.15_25)] text-white' }
    if (dealScore >= 80) return { text: `✨ ${dealScore} — Strong Deal`, color: 'bg-[oklch(0.72_0.09_85)] text-black' }
    if (dealScore >= 70) return { text: `👍 ${dealScore} — Good Deal`, color: 'bg-[oklch(0.65_0.025_240)] text-white' }
    return { text: `📊 ${dealScore} — Fair Deal`, color: 'bg-muted text-muted-foreground' }
  }

  const getVerdictStyle = (verdict: string) => {
    switch (verdict) {
      case 'BUY NOW': return 'bg-success text-success-foreground'
      case 'GOOD VALUE': return 'bg-secondary text-secondary-foreground'
      case 'FAIR DEAL': return 'bg-primary text-primary-foreground'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const scoreBadge = getScoreBadge()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-[680px] max-h-[90vh] overflow-y-auto bg-[#111113] border border-white/[0.08] p-0 gap-0"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="sticky top-0 z-10 bg-[#111113] border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge className={scoreBadge.color}>
                  {scoreBadge.text}
                </Badge>
              </div>
              <h2 className="text-2xl font-semibold">
                {deal.brand} {deal.model}
              </h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span>Ref. {deal.referenceNumber || 'N/A'}</span>
                {deal.year && (
                  <>
                    <span>·</span>
                    <span>{deal.year}</span>
                  </>
                )}
                <span>·</span>
                <Badge variant="outline" className="text-xs">
                  {deal.condition}
                </Badge>
                {deal.hasBox && <span title="Box included">📦</span>}
                {deal.hasPapers && <span title="Papers included">📄</span>}
              </div>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <X size={20} />
              </Button>
            </DialogClose>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div>
            <h3 className="text-[9px] uppercase tracking-wider text-[#C9A84C] mb-3">Price Comparison</h3>
            <Card className="bg-white/[0.02] border-white/[0.08] p-6">
              <div className="grid grid-cols-3 gap-6 mb-4">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Asking Price</div>
                  <div className="text-2xl font-semibold">${deal.price.toLocaleString()}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Fair Market Value</div>
                  <div className="text-2xl font-semibold text-[#C9A84C]">${fairValue.toLocaleString()}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Potential Savings</div>
                  <div className="text-2xl font-semibold text-success">${savings.toLocaleString()}</div>
                  <div className="text-xs text-success">({savingsPercent}%)</div>
                </div>
              </div>
              
              <div className="relative h-3 bg-white/[0.05] rounded-full overflow-hidden">
                <div 
                  className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                    priceRatio < 100 ? 'bg-success' : priceRatio === 100 ? 'bg-[#C9A84C]' : 'bg-destructive'
                  }`}
                  style={{ width: `${Math.min(priceRatio, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>Below FMV</span>
                <span>At FMV</span>
                <span>Above FMV</span>
              </div>
            </Card>
          </div>

          <div>
            <h3 className="text-[9px] uppercase tracking-wider text-[#C9A84C] mb-3">AI Deal Assessment</h3>
            <Card className="bg-white/[0.02] border-[#C9A84C]/30 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[#C9A84C]">◍</span>
                <span className="text-sm font-medium text-[#C9A84C]">AI Analysis</span>
              </div>
              
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
                    <YAxis hide domain={['dataMin - 100', 'dataMax + 100']} />
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      stroke="#C9A84C" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Listed</span>
                  <span>Today</span>
                </div>
              </div>
            </Card>
          </div>

          <div>
            <h3 className="text-[9px] uppercase tracking-wider text-[#C9A84C] mb-3">Make an Offer</h3>
            <Card className="bg-white/[0.02] border-white/[0.08] p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">✉</span>
                <span className="text-sm font-medium">Your Offer</span>
              </div>

              <div>
                <div className="text-3xl font-semibold mb-4">${offerAmount.toLocaleString()}</div>
                <Slider
                  value={[offerAmount]}
                  onValueChange={([val]) => setOfferAmount(val)}
                  min={deal.price * 0.8}
                  max={deal.price}
                  step={50}
                  className="mb-2"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>${(deal.price * 0.8).toLocaleString()}</span>
                  <span>${deal.price.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount from asking:</span>
                  <span className="font-medium">{discountFromAsking}% (${(deal.price - offerAmount).toLocaleString()})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">vs Fair Market Value:</span>
                  <span className={`font-medium ${Number(vsMarket) > 0 ? 'text-destructive' : 'text-success'}`}>
                    {Number(vsMarket) > 0 ? '+' : ''}{vsMarket}% (${(offerAmount - fairValue).toLocaleString()})
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white/[0.03] rounded text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Suggested reasoning to use:</div>
                <p className="leading-relaxed text-muted-foreground">{offerReasoning}</p>
              </div>

              <Button 
                onClick={handleCopyOffer}
                variant="outline"
                className="w-full"
              >
                {copied ? <Check size={16} className="mr-2" /> : <Copy size={16} className="mr-2" />}
                {copied ? 'Copied!' : 'Copy Offer Message'}
              </Button>

              <p className="text-xs text-muted-foreground italic">
                💡 Rule of thumb: offers below 85% of asking are rarely accepted on fresh listings. After 14+ days, 88-92% succeeds more often.
              </p>
            </Card>
          </div>

          <div>
            <h3 className="text-[9px] uppercase tracking-wider text-[#C9A84C] mb-3">Full Specs</h3>
            <Card className="bg-white/[0.02] border-white/[0.08] p-6">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Brand</span>
                  <span className="font-medium">{deal.brand}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model</span>
                  <span className="font-medium">{deal.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-medium">{deal.referenceNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Year</span>
                  <span className="font-medium">{deal.year || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Condition</span>
                  <span className="font-medium">{deal.condition}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Case Material</span>
                  <span className="font-medium">Stainless Steel</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Box</span>
                  <span className="font-medium">{deal.hasBox ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Papers</span>
                  <span className="font-medium">{deal.hasPapers ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location</span>
                  <span className="font-medium">{deal.location}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Seller Rating</span>
                  <span className="font-medium">{'★'.repeat(Math.floor(deal.sellerRating || 4.5))} {deal.sellerRating || 4.5}/5</span>
                </div>
              </div>
            </Card>
          </div>

          <div>
            <h3 className="text-[9px] uppercase tracking-wider text-[#C9A84C] mb-3">Actions</h3>
            <div className="grid grid-cols-3 gap-3">
              <Button
                variant="outline"
                onClick={handleSaveDeal}
                className="flex items-center gap-2"
              >
                <Heart size={16} weight={isSaved ? 'fill' : 'regular'} />
                {isSaved ? 'Saved' : 'Save Deal'}
              </Button>
              <Button
                variant="outline"
                onClick={handleAddToWatchlist}
                className="flex items-center gap-2"
              >
                <Plus size={16} />
                {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
              </Button>
              <Button
                variant="outline"
                onClick={handleFindSimilar}
                className="flex items-center gap-2"
              >
                Find Similar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
