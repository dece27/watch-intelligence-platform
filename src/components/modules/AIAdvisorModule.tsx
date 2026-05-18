import { useState } from "react"
import { Watch, MarketSignal } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Sparkle, PaperPlaneTilt } from "@phosphor-icons/react"
import { toast } from "sonner"

interface AIAdvisorModuleProps {
  watches: Watch[]
}

export function AIAdvisorModule({ watches }: AIAdvisorModuleProps) {
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const signals: MarketSignal[] = [
    {
      type: 'opportunity',
      title: 'Diversification Opportunity',
      description: `Your collection is heavily weighted toward ${watches[0]?.brand || 'certain brands'}. Consider adding sports watches or complications to balance risk.`
    },
    {
      type: 'insight',
      title: 'Strong Portfolio Performance',
      description: `Your collection has appreciated ${((watches.reduce((sum, w) => sum + (w.currentValue || w.purchasePrice), 0) - watches.reduce((sum, w) => sum + w.purchasePrice, 0)) / watches.reduce((sum, w) => sum + w.purchasePrice, 0) * 100).toFixed(1)}% on average. This outperforms the broader luxury watch market.`
    },
    {
      type: 'warning',
      title: 'Market Volatility Alert',
      description: 'Certain vintage models in your collection may see price fluctuations. Consider insurance coverage review.'
    }
  ]

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return

    const userMessage = chatInput
    setChatInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      const collectionSummary = watches.map(w => `${w.brand} ${w.model} (${w.year || 'N/A'}, $${w.purchasePrice})`).join(', ')
      
      const promptText = `You are a luxury watch expert advisor. The user has a collection of ${watches.length} watches: ${collectionSummary}. 
      
User question: ${userMessage}

Provide expert, concise advice about their collection, watch market trends, or collecting strategy. Be specific and reference their actual watches when relevant.`

      const response = await window.spark.llm(promptText, 'gpt-4o-mini')
      
      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } catch (error) {
      toast.error('Failed to get AI response')
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">AI Advisor</h1>
        <p className="text-muted-foreground mt-1">Intelligent insights and portfolio recommendations</p>
      </div>

      <Card className="bg-white/[0.025] border-white/[0.07]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkle className="text-primary" size={24} />
            Market Signals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {signals.map((signal, idx) => (
            <div key={idx} className="p-4 rounded-lg border border-white/[0.05] bg-white/[0.015]">
              <div className="flex items-start gap-3">
                <Badge variant={
                  signal.type === 'opportunity' ? 'default' : 
                  signal.type === 'warning' ? 'destructive' : 
                  'outline'
                }>
                  {signal.type.toUpperCase()}
                </Badge>
                <div className="flex-1">
                  <div className="font-semibold mb-1">{signal.title}</div>
                  <div className="text-sm text-muted-foreground">{signal.description}</div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-white/[0.025] border-white/[0.07]">
        <CardHeader>
          <CardTitle>Ask the AI Advisor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="min-h-[300px] max-h-[400px] overflow-y-auto space-y-3 p-4 rounded-lg bg-black/20 border border-white/[0.05]">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  <Sparkle size={48} className="mx-auto mb-3 text-primary/50" />
                  <p>Ask me anything about your collection, market trends, or collecting strategy.</p>
                  <div className="mt-6 space-y-2 text-sm">
                    <p className="text-xs text-muted-foreground">Try asking:</p>
                    <p className="text-foreground/70">"What should I add to my collection?"</p>
                    <p className="text-foreground/70">"Which of my watches has the best investment potential?"</p>
                    <p className="text-foreground/70">"How does my portfolio compare to typical collectors?"</p>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-3 rounded-lg ${
                      msg.role === 'user' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-white/[0.05] border border-white/[0.05]'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.05] border border-white/[0.05] p-3 rounded-lg">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Textarea
                placeholder="Ask about your collection, market trends, or investment advice..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                rows={2}
                disabled={isLoading}
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={!chatInput.trim() || isLoading}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <PaperPlaneTilt size={20} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
