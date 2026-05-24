import { useState, useEffect, useCallback } from "react"
import { Watch, NewsArticle } from "@/lib/types"
import { fetchNewsFeed, refreshNewsFeed, RSS_FEED_SOURCES } from "@/lib/news-feeds"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowsClockwise, MagnifyingGlass, ArrowSquareOut } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

interface NewsModuleProps {
  watches: Watch[]
}

type SortMode = 'recent' | 'relevant'
type TierFilter = 'all' | 1 | 2 | 3

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ArticleCard({ article }: { article: NewsArticle }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      <Card className="bg-card border-border h-full overflow-hidden transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
        {article.imageUrl && (
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
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
        <CardContent className={cn("p-4 flex flex-col gap-2", !article.imageUrl && "pt-4")}>
          {/* Source + time */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-primary/10 text-primary">
                {article.sourceIcon}
              </span>
              {article.source}
            </span>
            <span>{timeAgo(article.publishedAt)}</span>
          </div>

          {/* Title */}
          <p className="text-sm font-medium leading-snug text-foreground line-clamp-3 group-hover:text-primary transition-colors">
            {article.title}
          </p>

          {/* Summary */}
          {article.summary && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {article.summary}
            </p>
          )}

          {/* Brands + Tags */}
          {(article.brands.length > 0 || article.tags.length > 0) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {article.brands.slice(0, 2).map((b) => (
                <Badge key={b} variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/5 text-primary border-primary/20">
                  {b}
                </Badge>
              ))}
              {article.tags.slice(0, 2).map((t) => (
                <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                  {t}
                </Badge>
              ))}
            </div>
          )}

          {/* Read more indicator */}
          <div className="flex items-center gap-1 text-xs text-primary/60 group-hover:text-primary transition-colors mt-auto pt-1">
            <ArrowSquareOut size={12} />
            <span>Read more</span>
          </div>
        </CardContent>
      </Card>
    </a>
  )
}

function ArticleCardSkeleton() {
  return (
    <Card className="bg-card border-border overflow-hidden">
      <Skeleton className="aspect-video w-full" />
      <CardContent className="p-4 flex flex-col gap-2">
        <div className="flex justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
      </CardContent>
    </Card>
  )
}

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'recent', label: 'Latest' },
  { value: 'relevant', label: 'For You' },
]

const TIER_OPTIONS: Array<{ value: TierFilter; label: string }> = [
  { value: 'all', label: 'All Sources' },
  { value: 1, label: 'Tier 1' },
  { value: 2, label: 'Tier 2' },
  { value: 3, label: 'Tier 3' },
]

export function NewsModule({ watches }: NewsModuleProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sort, setSort] = useState<SortMode>('recent')
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [search, setSearch] = useState('')
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadArticles = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) setRefreshing(true)
      else setLoading(true)
      setLoadError(null)
      try {
        const data = forceRefresh
          ? await refreshNewsFeed(watches)
          : await fetchNewsFeed(watches, { sort, limit: 80 })
        setArticles(data)
        setLastFetched(new Date())
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load watch news feed.')
        console.error('[NewsModule] load failed:', err)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [watches, sort],
  )

  useEffect(() => {
    void loadArticles(false)
  }, [loadArticles])

  const sourcesInTier = (tier: TierFilter) =>
    tier === 'all' ? RSS_FEED_SOURCES.map((s) => s.name) : RSS_FEED_SOURCES.filter((s) => s.tier === tier).map((s) => s.name)

  const filtered = articles
    .filter((a) => {
      if (tierFilter !== 'all' && !sourcesInTier(tierFilter).includes(a.source)) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.source.toLowerCase().includes(q) ||
          a.brands.some((b) => b.toLowerCase().includes(q)) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
        )
      }
      return true
    })
    .sort((a, b) => {
      if (sort === 'relevant' && b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore
      }
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
            <span className="text-primary">◷</span> Watch Intelligence News
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {lastFetched
              ? `Updated ${timeAgo(lastFetched.toISOString())} · ${articles.length} articles from ${RSS_FEED_SOURCES.length} sources`
              : 'Loading latest stories from top watch publications…'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadArticles(true)}
          disabled={refreshing}
          className="shrink-0 gap-1.5"
        >
          <ArrowsClockwise size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <MagnifyingGlass
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pl-9"
            placeholder="Search articles, brands, topics…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Sort toggle */}
        <div className="flex rounded-md border border-border overflow-hidden shrink-0">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                sort === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Tier filter */}
        <div className="flex rounded-md border border-border overflow-hidden shrink-0">
          {TIER_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => setTierFilter(opt.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                tierFilter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* "For You" relevance note */}
      {sort === 'relevant' && watches.length > 0 && (
        <p className="text-xs text-muted-foreground">
          ◍ Articles scored based on brands you own:{' '}
          {[...new Set(watches.map((w) => w.brand))].slice(0, 4).join(', ')}
          {watches.length > 4 ? ` +${[...new Set(watches.map((w) => w.brand))].length - 4} more` : ''}
        </p>
      )}

      {/* Grid */}
      {loadError && !loading ? (
        <Card className="bg-card border-destructive/40">
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-sm text-destructive">News feed unavailable: {loadError}</p>
            <Button variant="outline" size="sm" onClick={() => loadArticles(true)}>
              Retry News Fetch
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <ArticleCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center text-muted-foreground">
            {search ? (
              <>
                <p className="font-medium mb-1">No articles match "{search}"</p>
                <p className="text-sm">Try a different search term or clear the filter.</p>
              </>
            ) : (
              <>
                <p className="font-medium mb-1">No articles loaded yet</p>
                <p className="text-sm">Click Refresh to fetch the latest stories from watch publications.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => loadArticles(true)}>
                  Refresh Now
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  )
}
