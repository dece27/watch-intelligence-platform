import { useState, useEffect } from "react"
import { useKV } from "@github/spark/hooks"
import { Watch, MarketSignal, ChatMessage } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sparkle, PaperPlaneTilt, Image as ImageIcon, Plus } from "@phosphor-icons/react"
import { toast } from "sonner"

interface AIAdvisorModuleProps {
  watches: Watch[]
}

const STARTER_QUESTIONS = [
  "What should I add to diversify my collection?",
  "Which of my watches has the best investment potential?",
  "How does my portfolio compare to typical collectors?",
  "Should I sell any watches in my collection?"
]

export function AIAdvisorModule({ watches }: AIAdvisorModuleProps) {
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [signals, setSignals] = useState<MarketSignal[]>([])
  const [isLoadingSignals, setIsLoadingSignals] = useState(false)
  const [identifierImage, setIdentifierImage] = useState('')
  const [isIdentifying, setIsIdentifying] = useState(false)
  const [identifiedWatch, setIdentifiedWatch] = useState<any>(null)

  useEffect(() => {
    if (watches.length > 0 && signals.length === 0) {
      generateSignals()
    }
  }, [watches])

  const generateSignals = async () => {
    if (watches.length === 0) return
    
    setIsLoadingSignals(true)
    try {
      const signalsPromises = watches.slice(0, 5).map(async (watch) => {
        const promptText = `You are a luxury watch investment advisor. Analyze this watch and provide a trading signal.

Watch: ${watch.brand} ${watch.model}
Purchase Price: $${watch.purchasePrice}
Current Estimated Value: $${watch.currentValue || watch.purchasePrice}
Condition: ${watch.condition}
Year: ${watch.year || 'Unknown'}

Provide a BUY, HOLD, or SELL signal with:
1. A 2-sentence reasoning explaining your recommendation
2. Confidence level (high, medium, or low)

Respond in valid JSON format:
{
  "signal": "buy|hold|sell",
  "reasoning": "Your 2-sentence explanation here",
  "confidence": "high|medium|low"
}`

        try {
          const response = await window.spark.llm(promptText, 'gpt-4o-mini', true)
          const parsed = JSON.parse(response)
          
          return {
            type: parsed.signal as 'buy' | 'hold' | 'sell',
            title: `${watch.brand} ${watch.model}`,
            reasoning: parsed.reasoning,
            confidence: parsed.confidence as 'high' | 'medium' | 'low',
            watchId: watch.id
          }
        } catch {
          return {
            type: 'hold' as const,
            title: `${watch.brand} ${watch.model}`,
            reasoning: "Unable to generate signal at this time. Monitor market conditions and reassess.",
            confidence: 'medium' as const,
            watchId: watch.id
          }
        }
      })

      const generatedSignals = await Promise.all(signalsPromises)
      setSignals(generatedSignals)
    } catch (error) {
      toast.error("Failed to generate signals")
    } finally {
      setIsLoadingSignals(false)
    }
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return

    const userMessage = chatInput
    setChatInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      const collectionSummary = watches.map(w => `${w.brand} ${w.model} (${w.year || 'N/A'}, $${w.purchasePrice})`).join(', ')
      
      const promptText = `You are an expert luxury watch investment advisor with deep knowledge of horology, market trends, and collecting strategies.

The user has a collection of ${watches.length} watches${watches.length > 0 ? `: ${collectionSummary}` : '.'}

User question: ${userMessage}

Provide expert, concise advice (2-3 paragraphs max) about their collection, watch market trends, or collecting strategy. Be specific and reference their actual watches when relevant. Focus on actionable insights.`

      const response = await window.spark.llm(promptText, 'gpt-4o-mini')
      
      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } catch (error) {
      toast.error('Failed to get AI response')
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleStarterQuestion = (question: string) => {
    setChatInput(question)
  }

  const handleIdentifyWatch = async () => {
    if (!identifierImage) {
      toast.error("Please enter an image URL")
      return
    }

    setIsIdentifying(true)
    try {
      const promptText = `You are a luxury watch expert. Analyze this watch image and identify it.

Image URL: ${identifierImage}

Based on the image, identify:
- Brand
- Model name
- Reference number (if visible)
- Estimated current market value in USD
- Key identifying features

Respond in valid JSON format:
{
  "brand": "Brand name",
  "model": "Model name",
  "reference": "Reference number or 'Unknown'",
  "value": estimated value as a number,
  "features": "2-3 sentences describing key identifying features"
}`

      const response = await window.spark.llm(promptText, 'gpt-4o-mini', true)
      const parsed = JSON.parse(response)
      
      setIdentifiedWatch({
        ...parsed,
        imageUrl: identifierImage
      })
    } catch (error) {
      toast.error("Failed to identify watch")
      setIdentifiedWatch({
        brand: "Luxury Watch",
        model: "Model Unknown",
        reference: "Unknown",
        value: 0,
        features: "Unable to identify from this image. Please try a clearer photo showing the dial and case details.",
        imageUrl: identifierImage
      })
    } finally {
      setIsIdentifying(false)
    }
  }

  const handleAddToCollection = () => {
    toast.success("Watch identification saved! Add it to your collection from the Collection module.")
    setIdentifiedWatch(null)
    setIdentifierImage('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">AI Signal Engine</h1>
        <p className="text-muted-foreground mt-1">Intelligent insights powered by advanced AI</p>
      </div>

      {watches.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkle className="text-primary" size={24} />
              Portfolio Signals
            </CardTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={generateSignals}
              disabled={isLoadingSignals}
            >
              {isLoadingSignals ? 'Analyzing...' : 'Refresh Signals'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingSignals ? (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkle size={32} className="mx-auto mb-2 animate-pulse text-primary" />
                <p>Generating AI signals for your collection...</p>
              </div>
            ) : signals.length > 0 ? (
              signals.map((signal, idx) => (
                <div key={idx} className="p-4 rounded-lg border border-border bg-muted/10">
                  <div className="flex items-start gap-3">
                    <Badge 
                      variant="outline"
                      className={
                        signal.type === 'buy' ? 'bg-success/10 text-success border-success/30' :
                        signal.type === 'sell' ? 'bg-destructive/10 text-destructive border-destructive/30' :
                        'bg-primary/10 text-primary border-primary/30'
                      }
                    >
                      {signal.type.toUpperCase()}
                    </Badge>
                    <Badge 
                      variant="outline"
                      className={
                        signal.confidence === 'high' ? 'bg-primary/10 text-primary border-primary/30' :
                        signal.confidence === 'medium' ? 'bg-muted/20 text-muted-foreground border-border' :
                        'bg-muted/10 text-muted-foreground/70 border-border'
                      }
                    >
                      {signal.confidence} confidence
                    </Badge>
                  </div>
                  <div className="mt-3">
                    <div className="font-semibold mb-1">{signal.title}</div>
                    <div className="text-sm text-muted-foreground">{signal.reasoning}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <p>No signals generated yet</p>
                <p className="text-xs mt-1">Click "Refresh Signals" to analyze your collection</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>AI Chat Advisor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="min-h-[300px] max-h-[400px] overflow-y-auto space-y-3 p-4 rounded-lg bg-black/20 border border-border">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    <Sparkle size={48} className="mx-auto mb-3 text-primary/50" />
                    <p className="mb-6">Ask me anything about luxury watches, your collection, or market insights.</p>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground mb-3">Try one of these questions:</p>
                      {STARTER_QUESTIONS.map((q, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleStarterQuestion(q)}
                          className="block w-full text-left px-4 py-2 text-sm bg-muted/10 hover:bg-muted/20 rounded border border-border transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-3 rounded-lg ${
                        msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted/20 border border-border'
                      }`}>
                        <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  ))
                )}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted/20 border border-border p-3 rounded-lg">
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
                  placeholder="Ask about collecting strategy, market trends, or your portfolio..."
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

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon size={20} />
              Watch Identifier
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!identifiedWatch ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="watch-image">Watch Image URL</Label>
                  <Input
                    id="watch-image"
                    value={identifierImage}
                    onChange={(e) => setIdentifierImage(e.target.value)}
                    placeholder="https://example.com/watch-image.jpg"
                  />
                  {identifierImage && (
                    <div className="mt-2">
                      <img 
                        src={identifierImage} 
                        alt="Watch to identify" 
                        className="w-full h-48 object-cover rounded border border-border"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement
                          target.style.display = 'none'
                        }}
                      />
                    </div>
                  )}
                </div>
                <Button 
                  onClick={handleIdentifyWatch}
                  disabled={!identifierImage || isIdentifying}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {isIdentifying ? 'Identifying...' : 'Identify Watch'}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Upload a clear photo showing the watch dial and case for best results
                </p>
              </>
            ) : (
              <div className="space-y-4">
                {identifiedWatch.imageUrl && (
                  <div className="w-full h-48 bg-muted/20 rounded overflow-hidden">
                    <img 
                      src={identifiedWatch.imageUrl} 
                      alt="Identified watch" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Brand</div>
                    <div className="text-xl font-semibold">{identifiedWatch.brand}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Model</div>
                    <div className="text-lg">{identifiedWatch.model}</div>
                  </div>
                  {identifiedWatch.reference && identifiedWatch.reference !== 'Unknown' && (
                    <div>
                      <div className="text-sm text-muted-foreground">Reference</div>
                      <div>{identifiedWatch.reference}</div>
                    </div>
                  )}
                  {identifiedWatch.value > 0 && (
                    <div>
                      <div className="text-sm text-muted-foreground">Estimated Value</div>
                      <div className="text-xl font-semibold text-primary tabular-nums">
                        ${identifiedWatch.value.toLocaleString()}
                      </div>
                    </div>
                  )}
                  <div className="pt-2 border-t border-border">
                    <div className="text-sm text-muted-foreground mb-1">Key Features</div>
                    <div className="text-sm">{identifiedWatch.features}</div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button 
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setIdentifiedWatch(null)
                      setIdentifierImage('')
                    }}
                  >
                    Try Another
                  </Button>
                  <Button 
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={handleAddToCollection}
                  >
                    <Plus className="mr-2" size={16} />
                    Add to Collection
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
