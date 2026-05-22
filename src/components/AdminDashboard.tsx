import { useEffect, useMemo, useState } from "react"
import { Watch, User, AuthRecord } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { UserAIUsage } from "@/lib/adminAnalytics"

interface AdminUserStats {
  user: User
  watchCount: number
  loginCount: number
  aiTokensUsed: number
  aiRequestsCount: number
  lastLoginAt?: string
}

export function AdminDashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<AdminUserStats[]>([])

  const loadStats = async () => {
    setIsLoading(true)
    const userIds = await window.spark.kv.get<string[]>("all_user_ids") || []
    const rows: AdminUserStats[] = []

    for (const userId of userIds) {
      const user = await window.spark.kv.get<User>(`user_${userId}`)
      if (!user) continue

      const auth = await window.spark.kv.get<AuthRecord>(`auth_${userId}`)
      const watches = await window.spark.kv.get<Watch[]>(`watches_${userId}`)
      const usage = await window.spark.kv.get<UserAIUsage>(`ai_usage_${userId}`)

      rows.push({
        user,
        watchCount: watches?.length || 0,
        loginCount: auth?.loginCount || 0,
        aiTokensUsed: usage?.aiTokensUsed || 0,
        aiRequestsCount: usage?.aiRequestsCount || 0,
        lastLoginAt: auth?.lastLoginAt,
      })
    }

    rows.sort((a, b) => new Date(b.user.createdAt).getTime() - new Date(a.user.createdAt).getTime())
    setStats(rows)
    setIsLoading(false)
  }

  useEffect(() => {
    loadStats()
  }, [])

  const totals = useMemo(() => {
    const totalUsers = stats.length
    const totalWatches = stats.reduce((sum, row) => sum + row.watchCount, 0)
    const totalLogins = stats.reduce((sum, row) => sum + row.loginCount, 0)
    const totalAiTokens = stats.reduce((sum, row) => sum + row.aiTokensUsed, 0)
    const avgWatchesPerUser = totalUsers > 0 ? (totalWatches / totalUsers).toFixed(1) : "0.0"

    return {
      totalUsers,
      totalWatches,
      totalLogins,
      totalAiTokens,
      avgWatchesPerUser,
    }
  }, [stats])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Admin Dashboard</h2>
          <p className="text-muted-foreground mt-1">Platform-level user and usage analytics</p>
        </div>
        <Button onClick={loadStats} variant="outline">
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Users Created</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totals.totalUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Watches in Collections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totals.totalWatches}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Logins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totals.totalLogins}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">AI Tokens Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totals.totalAiTokens.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Avg Watches / User</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totals.avgWatchesPerUser}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Breakdown</CardTitle>
          <CardDescription>Per-user account, login, collection, and AI usage stats</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading admin stats...</p>
            </div>
          ) : stats.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">No users available yet</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {stats.map((row, index) => (
                  <div key={row.user.id}>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">User</p>
                        <p className="font-medium">{row.user.email}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Created</p>
                        <p>{new Date(row.user.createdAt).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Watches</p>
                        <p className="font-medium">{row.watchCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Logins</p>
                        <p className="font-medium">{row.loginCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">AI Requests</p>
                        <p className="font-medium">{row.aiRequestsCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">AI Tokens</p>
                        <p className="font-medium">{row.aiTokensUsed.toLocaleString()}</p>
                      </div>
                    </div>
                    {row.lastLoginAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Last login: {new Date(row.lastLoginAt).toLocaleString()}
                      </p>
                    )}
                    {index < stats.length - 1 && <Separator className="mt-4" />}
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
