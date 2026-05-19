import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChatCircleDots, User, Calendar } from "@phosphor-icons/react"
import { Separator } from "@/components/ui/separator"

interface FeedbackItem {
  id: string
  feedback: string
  userEmail: string
  timestamp: string
}

export function FeedbackDashboard() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadFeedback()
  }, [])

  const loadFeedback = async () => {
    setIsLoading(true)
    const feedbackIds = await window.spark.kv.get<string[]>("all_feedback_ids") || []
    
    const feedbackItems: FeedbackItem[] = []
    for (const id of feedbackIds) {
      const item = await window.spark.kv.get<FeedbackItem>(id)
      if (item) {
        feedbackItems.push(item)
      }
    }
    
    feedbackItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    setFeedback(feedbackItems)
    setIsLoading(false)
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Feedback Dashboard</h2>
          <p className="text-muted-foreground mt-1">
            Review feedback from collectors
          </p>
        </div>
        <Button onClick={loadFeedback} variant="outline">
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{feedback.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {new Set(feedback.map(f => f.userEmail)).size}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Latest Submission</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {feedback.length > 0 ? formatDate(feedback[0].timestamp) : 'No feedback yet'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Feedback</CardTitle>
          <CardDescription>
            Submissions from your collector community
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading feedback...</p>
            </div>
          ) : feedback.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ChatCircleDots size={48} className="text-muted-foreground mb-4" weight="duotone" />
              <p className="text-muted-foreground">No feedback received yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Feedback will appear here once collectors submit their thoughts
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {feedback.map((item, index) => (
                  <div key={item.id}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="gap-1">
                            <User size={12} />
                            {item.userEmail}
                          </Badge>
                          <Badge variant="outline" className="gap-1">
                            <Calendar size={12} />
                            {formatDate(item.timestamp)}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {item.feedback}
                      </p>
                    </div>
                    {index < feedback.length - 1 && <Separator className="mt-4" />}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
