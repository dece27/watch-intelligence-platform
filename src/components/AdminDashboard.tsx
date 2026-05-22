import { useEffect, useMemo, useState } from "react"
import { Watch, User, AuthRecord } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { UserAIUsage, ADMIN_EMAIL } from "@/lib/adminAnalytics"
import { toast } from "sonner"

interface AdminUserStats {
  user: User
  watchCount: number
  loginCount: number
  aiTokensUsed: number
  aiRequestsCount: number
  lastLoginAt?: string
  createdAtTimestamp: number
}

const WATCH_PHOTO_KEY_PREFIX = "watch_photo_"
const WATCH_PHOTO_REF_PREFIX = "kv-photo:"

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function getWatchPhotoKey(userId: string, watchId: string): string {
  return `${WATCH_PHOTO_KEY_PREFIX}${userId}_${watchId}`
}

export function AdminDashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<AdminUserStats[]>([])
  const [isResetting, setIsResetting] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)

  const loadStats = async () => {
    setIsLoading(true)
    const userIds = await window.spark.kv.get<string[]>("all_user_ids") || []
    const rowsWithNulls = await Promise.all(userIds.map(async (userId) => {
      const [user, auth, watches, usage] = await Promise.all([
        window.spark.kv.get<User>(`user_${userId}`),
        window.spark.kv.get<AuthRecord>(`auth_${userId}`),
        window.spark.kv.get<Watch[]>(`watches_${userId}`),
        window.spark.kv.get<UserAIUsage>(`ai_usage_${userId}`),
      ])

      if (!user) return null

      return {
        user,
        watchCount: watches?.length || 0,
        loginCount: auth?.loginCount || 0,
        aiTokensUsed: usage?.aiTokensUsed || 0,
        aiRequestsCount: usage?.aiRequestsCount || 0,
        lastLoginAt: auth?.lastLoginAt,
        createdAtTimestamp: new Date(user.createdAt).getTime(),
      } satisfies AdminUserStats
    }))

    const rows = rowsWithNulls.filter((row): row is AdminUserStats => row !== null)

    rows.sort((a, b) => b.createdAtTimestamp - a.createdAtTimestamp)
    setStats(rows)
    setIsLoading(false)
  }

  useEffect(() => {
    loadStats()
  }, [])

  const handleResetEnvironment = async () => {
    setIsResetting(true)
    try {
      const userIds = await window.spark.kv.get<string[]>("all_user_ids") || []

      const adminUserIds: string[] = []
      for (const userId of userIds) {
        const user = await window.spark.kv.get<User>(`user_${userId}`)
        if (!user) continue

        const isAdmin = normalizeEmail(user.email) === ADMIN_EMAIL

        if (isAdmin) {
          adminUserIds.push(userId)
          continue
        }

        // Delete watch photos for this user
        const watches = await window.spark.kv.get<Watch[]>(`watches_${userId}`) || []
        await Promise.all(
          watches
            .filter((w) => w.imageUrl?.startsWith(WATCH_PHOTO_REF_PREFIX))
            .map((w) => {
              const watchId = w.imageUrl!.slice(WATCH_PHOTO_REF_PREFIX.length)
              return window.spark.kv.delete(getWatchPhotoKey(userId, watchId))
            })
        )

        // Delete all user-specific keys
        await Promise.all([
          window.spark.kv.delete(`user_email_${normalizeEmail(user.email)}`),
          window.spark.kv.delete(`user_${userId}`),
          window.spark.kv.delete(`auth_${userId}`),
          window.spark.kv.delete(`watches_${userId}`),
          window.spark.kv.delete(`ai_usage_${userId}`),
          window.spark.kv.delete(`vaultMetadata_${userId}`),
        ])
      }

      // Update user index to only retain admin accounts
      await window.spark.kv.set("all_user_ids", adminUserIds)

      // Delete non-admin feedback
      const feedbackIds = await window.spark.kv.get<string[]>("all_feedback_ids") || []
      const remainingFeedbackIds: string[] = []
      await Promise.all(
        feedbackIds.map(async (feedbackId) => {
          const item = await window.spark.kv.get<{ userEmail?: string }>(feedbackId)
          if (item?.userEmail && normalizeEmail(item.userEmail) === ADMIN_EMAIL) {
            remainingFeedbackIds.push(feedbackId)
          } else {
            await window.spark.kv.delete(feedbackId)
          }
        })
      )
      await window.spark.kv.set("all_feedback_ids", remainingFeedbackIds)

      const deletedUserCount = userIds.length - adminUserIds.length
      toast.success(`Environment reset: ${deletedUserCount} user account${deletedUserCount === 1 ? "" : "s"} removed.`)
      await loadStats()
    } catch (error) {
      console.error("Error resetting environment:", error)
      toast.error("Failed to reset environment. Please try again.")
    } finally {
      setIsResetting(false)
      setShowResetDialog(false)
    }
  }

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
        <Button
          onClick={() => setShowResetDialog(true)}
          variant="destructive"
          disabled={isResetting}
        >
          {isResetting ? "Resetting…" : "Reset Environment"}
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

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Environment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all user accounts, collections, watch photos, AI usage
              records, and feedback — except for the admin account ({ADMIN_EMAIL}). This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetEnvironment}
              disabled={isResetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isResetting ? "Resetting…" : "Yes, Reset Everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
