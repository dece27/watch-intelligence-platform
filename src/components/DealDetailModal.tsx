import { useState, useEffect } from "react"
import { Deal } from "@/lib/types"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Heart, Plus, Copy, Check } from "@phosphor-icons/react"
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { useKV } from "@github/spark/hooks"
  onOpenChange: (open: boolean


  open: boolean
  reasoning: string
  onOpenChange: (open: boolean) => void

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
Asking Price: $${deal.
Condition: ${deal.condition}
Has Papers: ${deal.ha

- VERDICT: o
- RISK: one sentence on the main risk factor`
  }
 

          setAiAnalysis({
            reasoning: reasoningMatch?.[1]?.trim() || 'Analysis in progr
          })
          setAiAnalysis({
            reasoning: 'Unable to complete an
          })
        setIsLoadingAI(false)

    }


  const savings = deal.pr
  
  cons
  const urgencyText = 
      ? `Fres
      ? `Good timing - seller may be open to reasonable offers.`
  
    day: i + 1,
  }))
  const vsMarket = ((offerAm

  const isInWatchlist = watc
  const handleSaveDeal = () => {
      current.includes(deal.id) 
        : [...current, deal.id]


    setWatchlist((current = []) =>
        ? current.filter(id => id !== deal.id)
    )

  const handleFindSimilar = () => {
      onFi
      toast.success(`Filtering deals by ${deal.brand}`)
  }
  const handleCopyOffer = () => {
    setCop
    setTimeout(() => setC

    <Dialog open={open} onOpenChange={onOpenChange}>
        <div className="space-y-6">
            
            </h2>
              <span>{deal
              <span>{deal.conditi
              <span>{deal.location}</span>
          </div>
          <d
         
            </Card>
       
      
              <div cl
     


              {isLoading

                  <div className="h-12 bg-white/[0.05] rounded anima
              ) : aiAnalysis ? (
                  <Badge className={`${getVerdictStyle(aiAnalysis.verdict)} text-base
  
                  <div>
                    <p cla
                  
                    <d
                  </div>
              ) : (
              )}
          </div>
          <div>
  
                <span className="text-2xl">⚡</span>
               
                    Similar {deal.brand} {deal.model} refer
     

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

                <p className="flex-1">{urgencyText}</p>


              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Price History on This Listing</div>
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={priceHistory}>

                      dataKey="day" 
                      hide 
                    />





























































































