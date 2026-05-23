import { useState, useEffect } from "react"
import { Watch, NewsArticle } from "@/lib/types"
import { fetchNewsFeed } from "@/lib/news-feeds"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowSquareOut } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

interface TopStoriesWidgetProps {
  watches: Watch[]
  onViewAll?: () => void
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function StoryCard({ article }: { article: NewsArticle }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group shrink-0 w-64 sm:w-72"
    >
      <Card className="bg-card border-border h-full overflow-hidden transition-all duration-200 hover:border-primary/40">
        {article.imageUrl && (
          <div className="relative h-32 w-full overflow-hidden bg-muted">
            <img
              src={article.imageUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        )}
        <CardContent className={cn("p-3 flex flex-col gap-1.5", !article.imageUrl && "pt-3")}>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-primary/10 text-primary">
                {article.sourceIcon}
              </span>
              {article.source}
            </span>
            <span>{timeAgo(article.publishedAt)}</span>
          </div>
          <p className="text-xs font-medium leading-snug text-foreground line-clamp-3 group-hover:text-primary transition-colors">
            {article.title}
          </p>
          <div className="flex items-center gap-1 text-[10px] text-primary/60 group-hover:text-primary transition-colors mt-auto">
            <ArrowSquareOut size={10} />
            <span>Read</span>
          </div>
        </CardContent>
      </Card>
    </a>
  )
}

function StoryCardSkeleton() {
  return (
    <div className="shrink-0 w-64 sm:w-72">
      <Card className="bg-card border-border overflow-hidden">
        <Skeleton className="h-32 w-full" />
        <CardContent className="p-3 flex flex-col gap-1.5">
          <div className="flex justify-between">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-2.5 w-10" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </CardContent>
      </Card>
    </div>
  )
}

export function TopStoriesWidget({ watches, onViewAll }: TopStoriesWidgetProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const data = await fetchNewsFeed(watches, { sort: 'relevant', limit: 10 })
        if (active) setArticles(data.slice(0, 3))
      } catch {
        // silent
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [watches])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
          <span className="text-primary">◷</span> Top Stories
        </h2>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-primary hover:underline"
          >
            View all →
          </button>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <StoryCardSkeleton key={i} />)
          : articles.length > 0
          ? articles.map((a) => <StoryCard key={a.id} article={a} />)
          : (
            <p className="text-xs text-muted-foreground py-4">
              News unavailable — check back later.
            </p>
          )}
      </div>
    </div>
  )
}
