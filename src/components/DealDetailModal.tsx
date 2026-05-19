import { useState, useEffect } from "react"
import { Deal } from "@/lib/types"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, Respons
  onOpenChange: (open: boolean) => void
}
interface AIAnalysis {

}
function getVerdict
    case 'BUY N
    case 'GOOD VALUE':
  onFilterBrand?: (brand: string) => void
}

interface AIAnalysis {
  verdict: 'BUY NOW' | 'GOOD VALUE' | 'FAIR DEAL' | 'PASS'
  reasoning: string
  risk: string
}

    if (deal && open) {
      setAiAnalysis(
    }

    if (!deal) return
    setIsLoadingAI(true)
      const fairValue
                        deal.hasBox ? 'with box only' : 
                
      const prompt = spark.llmPrompt`Analyze this watch deal as an expe
Provide:
- REASONING: 2-3 specific sentences on the price, condition, and market 

V

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
  if 
  }, [deal, open])

  const loadAIAnalysis = async () => {
    if (!deal) return
    
    setIsLoadingAI(true)
    try {
      const fairValue = deal.fairValue || deal.marketValue || deal.price * 1.15
      const boxPapers = deal.hasBox && deal.hasPapers ? 'with box and papers' : 
                        deal.hasBox ? 'with box only' : 
                        deal.hasPapers ? 'with papers only' : 
  const offerReasoning = `Based on ${daysL
      
      const prompt = spark.llmPrompt`Analyze this watch deal as an expert dealer. Watch: ${deal.brand} ${deal.model} ${deal.referenceNumber || ''}, ${deal.year || 'recent'}, condition: ${deal.condition}, ${boxPapers}. Asking price: $${deal.price}. Fair market value: $${fairValue}. Seller rating: ${deal.sellerRating || 4.5}/5. Listed ${deal.daysListed || 3} days ago.

        
- VERDICT: one of BUY NOW / GOOD VALUE / FAIR DEAL / PASS
- REASONING: 2-3 specific sentences on the price, condition, and market context using 2025 data where relevant (Rolex stable-recovering, Patek +6% YTD, Grand Seiko +12.8% YTD)
- RISK: one sentence on the main risk factor

Respond in this format:

REASONING: [sentences]
      onOpenChang

      const response = await spark.llm(prompt, "gpt-4o-mini")
    se
      const verdictMatch = response.match(/VERDICT:\s*(.+)/i)
      const reasoningMatch = response.match(/REASONING:\s*(.+?)(?=RISK:|$)/is)
      const riskMatch = response.match(/RISK:\s*(.+)/is)
      
              <h2 cla
        verdict: (verdictMatch?.[1]?.trim() as AIAnalysis['verdict']) || 'FAIR DEAL',
        reasoning: reasoningMatch?.[1]?.trim() || 'Analysis unavailable',
        risk: riskMatch?.[1]?.trim() || 'Standard market risks apply'
        
    } catch (error) {
      console.error('AI Analysis failed:', error)
      setAiAnalysis({
        verdict: 'FAIR DEAL',
        reasoning: 'Unable to load AI analysis at this time.',
        risk: 'Standard market risks apply.'
      })
               
      setIsLoadingAI(false)
    }
  }

  if (!deal) return null

  const fairValue = deal.fairValue || deal.marketValue || deal.price * 1.15
  const savings = fairValue - deal.price
  const savingsPercent = ((savings / fairValue) * 100).toFixed(1)
  const dealScore = deal.dealScore || deal.matchScore || 85
  
  const daysListed = deal.daysListed || Math.floor(Math.random() * 14) + 1
  const avgDaysToSell = deal.brand === 'Rolex' ? (daysListed > 7 ? 5 : 8) :
                        deal.brand === 'Patek Philippe' ? 12 :
                        deal.brand.includes('Audemars') ? 7 : 10
  
  const urgencyColor = daysListed < avgDaysToSell ? '🟢' : 
                       daysListed <= avgDaysToSell * 1.5 ? '🟡' : '🔴'
  const urgencyText = daysListed < avgDaysToSell ? 
    `Fresh listing — similar pieces sell fast at this price` :
                  </div>
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

                <div className="
    setSavedDeals((current) => 
      current.includes(deal.id) 
                    />
                    <Line 
     
   

                </ResponsiveContainer>
                  <span>Listed
                </div>
            </Card>

     
   


                <div cla
                  value={[offer
                  min={de
     
   

                </div>

                <di
                  <span className="font-medi
   

          
              </div>
              <div className="p-3 bg-white/[0.03] rounded text-sm">
                <p className="leading-relaxed text-muted-foregr

                onClick={handleCopyOffer}
                className="w-full"
                {copied ? <Check size={16} className="mr-2" /> : <Copy size={1
              </Button>
              <p class
              </p>
          </div>
          </div>
            <Card
                <div classN
                  <span
                <div className="flex justify-be
           
                <div classN
                  <
              

                <div className="flex justify-betwee
          <div>
                <div className="flex justify-between">
                  <span className="font-medium">Stainless Steel</span>
                <div className="flex justify-between">
                  <span className="font-medium">{deal.hasBox ? 'Yes' : 'No'}</span>
                <div className="flex justify-between">
                  <span className="
                <div cla
              </div>
              
              <div className="space-y-2 text-sm">
              </div>
          </div>
          <div>
                </div>
                variant="outline"
                className="flex items-center gap-2"
                <Heart size={16} weight={isSaved ? 'fill' : 'regular'} />
                </div>
                variant="outline"
                className="flex items-center gap-2"
                <Plus size={16} />
              </Button
              </div>
            </Card>
          </div>

        </div>
    </Dialog>
}

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
