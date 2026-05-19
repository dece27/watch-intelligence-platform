import { useState, useEffect } from "react"
import { Deal } from "@/lib/types"
import { Deal } from "@/lib/types"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Heart, Plus, Copy, Check } from "@phosphor-icons/react"
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { toast } from "sonner"

interface DealDetailModalProps {
interface AIAnalysi
  open: boolean
  risk: string
  onFilterBrand?: (brand: string) => void
 

  }

  const [aiAnalysis
  const [saved
 

      analyzeWithAI()
  }, [open, deal])
  const analyzeWith
    
    try {

Reference: ${deal.ref
Fair Value: $${deal.fairValue?.toLocaleString() || 'Unknown'}
Has Box: ${deal.

- VERDICT: o
- RISK: one sentence on the main risk factor`
   
 

      if (verdictMatch) {
          verdict: verdictMatch[1] as AIAnalysis['verdict'],
          risk: riskMatch?.[1]?.trim() || 'No significa
      } else {
          verdict: 'FAIR DEAL',
          risk: 'Analysis incomplete'

      setAiAnalysis
        reasoning: 'Unable to complete
      })
     
  }

  }
  const fairValue = d
  co
  const daysListed = dea
  const u
      ? `Fresh listing - seller expectations are likely firm.`

Watch: ${deal.brand} ${deal.model}
Reference: ${deal.referenceNumber || 'N/A'}
Asking Price: $${deal.price.toLocaleString()}
Fair Value: $${deal.fairValue?.toLocaleString() || 'Unknown'}
Condition: ${deal.condition}
  const isSaved = savedDeals?.includes


        ? current.filter(id =
    )
- REASONING: 2-3 sentences on why this is or isn't a good deal
  const handleAddToWatchlist = () => {

        : [...current, deal.id]
      

    if (onFilterBrand) {
      onOpenChange(false)


        setAiAnalysis({
    toast.success('Offer message copied to clipboard!')
  }
  return (
        })
          <div
        setAiAnalysis({
            <div className="fle
              <span>•</span>
              <span>•</span>
        })

    } catch (error) {
              <div cl
        verdict: 'FAIR DEAL',
              <div className="text-2xl font-semibold">${fairVal
        risk: 'Analysis incomplete'
        
          </div
          <div>
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
              {isSa
            <Card className="bg-white/[0.02] border-white/[0.08] p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Est. Fair Value</div>
              <div className="text-2xl font-semibold">${fairValue.toLocaleString()}</div>
            {onFilt
            <Card className="bg-white/[0.02] border-white/[0.08] p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Potential Savings</div>
              <div className="text-2xl font-semibold text-success">${savings.toLocaleString()} ({savingsPercent}%)</div>
        </div>
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

                <div className="space-y-4">
                  <Badge className={`${getVerdictStyle(aiAnalysis.verdict)} text-base px-4 py-1`}>
                    {aiAnalysis.verdict}
                  </Badge>
                  

                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Reasoning</div>
                    <p className="text-sm leading-relaxed">{aiAnalysis.reasoning}</p>
                  </div>


                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Risk</div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{aiAnalysis.risk}</p>

                </div>

                <p className="text-sm text-muted-foreground">Analysis unavailable</p>

            </Card>



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

              <div className="flex items-start gap-2 text-sm p-3 bg-white/[0.03] rounded">

                <p className="flex-1">{urgencyText}</p>
              </div>


                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Price History on This Listing</div>

                  <LineChart data={priceHistory}>

                      dataKey="day" 
                      hide 
                    />
                    <YAxis hide domain={['dataMin - 500', 'dataMax + 500']} />
                    <Line 

                      dataKey="price" 

                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>


            <h3 className="text-[9px] uppercase tracking-wider text-[#C9A84C] mb-3">Suggested Offer</h3>
            <Card className="bg-white/[0.02] border-white/[0.08] p-6 space-y-4">
              <div className="flex items-center justify-between">

                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Offer Amount</div>
                  <div className="text-3xl font-semibold">${offerAmount.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground mt-1">{vsMarket}% vs market average</div>

                <Button onClick={handleCopyOffer} size="lg" className="gap-2">

                  {copied ? 'Copied!' : 'Copy Offer Message'}

              </div>

              <div className="p-4 bg-white/[0.03] rounded border border-white/[0.05]">
                <p className="text-sm leading-relaxed italic">{offerReasoning}</p>
              </div>

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
