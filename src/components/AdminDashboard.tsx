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
import { UserAIUsage, isAdminEmail } from "@/lib/adminAnalytics"
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
  const [isDeletingUserId, setIsDeletingUserId] = useState<string | null>(null)
  const [selectedUserForDeletion, setSelectedUserForDeletion] = useState<User | null>(null)

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

    const rows = rowsWithNulls.filter((row): row is NonNullable<typeof row> => row !== null) as AdminUserStats[]

    rows.sort((a, b) => (b.createdAtTimestamp ?? 0) - (a.createdAtTimestamp ?? 0))
    setStats(rows)
    setIsLoading(false)
  }

  useEffect(() => {
    loadStats()
  }, [])

  const deleteSingleUserData = async (userId: string, userEmail: string) => {
    const watches = await window.spark.kv.get<Watch[]>(`watches_${userId}`) || []
    await Promise.all(
      watches
        .filter((w) => w.imageUrl?.startsWith(WATCH_PHOTO_REF_PREFIX))
        .map((w) => {
          const watchId = w.imageUrl!.slice(WATCH_PHOTO_REF_PREFIX.length)
          return window.spark.kv.delete(getWatchPhotoKey(userId, watchId))
        })
    )

    const userDeletionTasks = [
      window.spark.kv.delete(`user_${userId}`),
      window.spark.kv.delete(`auth_${userId}`),
      window.spark.kv.delete(`watches_${userId}`),
      window.spark.kv.delete(`ai_usage_${userId}`),
      window.spark.kv.delete(`vaultMetadata_${userId}`),
    ]

    userDeletionTasks.push(window.spark.kv.delete(`user_email_${normalizeEmail(userEmail)}`))

    await Promise.all(userDeletionTasks)

    const userIds = await window.spark.kv.get<string[]>("all_user_ids") || []
    await window.spark.kv.set("all_user_ids", userIds.filter((id) => id !== userId))

    const normalizedUserEmail = normalizeEmail(userEmail)
    const feedbackIds = await window.spark.kv.get<string[]>("all_feedback_ids") || []
    const feedbackRecords = await Promise.all(
      feedbackIds.map(async (feedbackId) => {
        const lookupKeys = Array.from(new Set([feedbackId, `feedback_${feedbackId}`]))
        const feedbackCandidates = await Promise.all(
          lookupKeys.map(async (lookupKey) => ({
            lookupKey,
            feedback: await window.spark.kv.get<{ userEmail?: string }>(lookupKey),
          }))
        )
        const resolvedFeedback = feedbackCandidates.find((candidate) => candidate.feedback)
        return {
          feedbackId,
          feedbackOwnerEmail: resolvedFeedback?.feedback?.userEmail,
          resolvedFeedbackKey: resolvedFeedback?.lookupKey,
        }
      })
    )

    const feedbackKeysToDelete: string[] = []
    const keptFeedbackIds: string[] = []

    for (const feedbackRecord of feedbackRecords) {
      if (
        feedbackRecord.feedbackOwnerEmail &&
        normalizeEmail(feedbackRecord.feedbackOwnerEmail) === normalizedUserEmail
      ) {
        if (feedbackRecord.resolvedFeedbackKey) {
          feedbackKeysToDelete.push(feedbackRecord.resolvedFeedbackKey)
        }
        continue
      }

      keptFeedbackIds.push(feedbackRecord.feedbackId)
    }

    await Promise.all(feedbackKeysToDelete.map((feedbackKey) => window.spark.kv.delete(feedbackKey)))

    await window.spark.kv.set("all_feedback_ids", keptFeedbackIds)
  }

  const handleDeleteSingleUser = async () => {
    if (!selectedUserForDeletion) return
    if (isAdminEmail(selectedUserForDeletion.email)) {
      toast.error("Admin accounts cannot be deleted.")
      setSelectedUserForDeletion(null)
      return
    }

    setIsDeletingUserId(selectedUserForDeletion.id)

    try {
      await deleteSingleUserData(selectedUserForDeletion.id, selectedUserForDeletion.email)
      toast.success(`Deleted all data for ${selectedUserForDeletion.email}.`)
      await loadStats()
    } catch (error) {
      console.error("Error deleting single user data:", error)
      toast.error("Failed to delete user data. Please try again.")
    } finally {
      setIsDeletingUserId(null)
      setSelectedUserForDeletion(null)
    }
  }

  const handleResetEnvironment = async () => {
    setIsResetting(true)
    try {
      const userIds = await window.spark.kv.get<string[]>("all_user_ids") || []

      const preservedUserIds: string[] = []

      for (const userId of userIds) {
        const user = await window.spark.kv.get<User>(`user_${userId}`)

        // Preserve the admin account so it remains accessible after reset
        if (user?.email && isAdminEmail(user.email)) {
          preservedUserIds.push(userId)
          continue
        }

        // If the user profile no longer exists we still clean up any remaining
        // auth / watches / usage keys that may be orphaned for this userId.
        // Watch-photo deletion and email-key deletion require the user's email
        // and are only performed when the profile is available.
        const userDeletionTasks = [
          window.spark.kv.delete(`user_${userId}`),
          window.spark.kv.delete(`auth_${userId}`),
          window.spark.kv.delete(`watches_${userId}`),
          window.spark.kv.delete(`ai_usage_${userId}`),
          window.spark.kv.delete(`vaultMetadata_${userId}`),
        ]

        if (user?.email) {
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

          userDeletionTasks.push(window.spark.kv.delete(`user_email_${normalizeEmail(user.email)}`))
        }

        await Promise.all(userDeletionTasks)
      }

      // Update user index to only contain the preserved admin account(s)
      await window.spark.kv.set("all_user_ids", preservedUserIds)

      // Delete all feedback
      const feedbackIds = await window.spark.kv.get<string[]>("all_feedback_ids") || []
      await Promise.all(
        feedbackIds.map(async (feedbackId) => {
          await window.spark.kv.delete(feedbackId)
        })
      )
      await window.spark.kv.set("all_feedback_ids", [])

      const deletedUserCount = userIds.length - preservedUserIds.length
      const deletedFeedbackCount = feedbackIds.length
      toast.success(`Reset complete: ${deletedUserCount} account${deletedUserCount === 1 ? "" : "s"} and ${deletedFeedbackCount} feedback entr${deletedFeedbackCount === 1 ? "y" : "ies"} removed. Admin account preserved.`)
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
        <div className="flex items-center gap-2">
          <Button onClick={loadStats} variant="outline">
            Refresh
          </Button>
          <Button
            onClick={() => setShowResetDialog(true)}
            variant="destructive"
            disabled={isResetting || Boolean(isDeletingUserId)}
          >
            {isResetting ? "Resetting…" : "Reset Environment"}
          </Button>
        </div>
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
                {stats.map((row, index) => {
                  const isAdminUser = isAdminEmail(row.user.email)
                  return (
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
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="destructive"
                        size="sm"
                        aria-busy={isDeletingUserId === row.user.id}
                        disabled={isResetting || Boolean(isDeletingUserId) || isAdminUser}
                        onClick={() => setSelectedUserForDeletion(row.user)}
                      >
                        {isDeletingUserId === row.user.id ? "Deleting…" : isAdminUser ? "Admin Protected" : "Delete User Data"}
                      </Button>
                    </div>
                    {index < stats.length - 1 && <Separator className="mt-4" />}
                    </div>
                  )
                })}
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
              This will permanently delete all non-admin user accounts, collections, watch photos, AI usage
              records, and feedback. The admin account will be preserved. This action cannot be undone.
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

      <AlertDialog
        open={Boolean(selectedUserForDeletion)}
        onOpenChange={(open) => {
          if (!open && !isDeletingUserId) {
            setSelectedUserForDeletion(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all data for{" "}
              <span className="font-medium">{selectedUserForDeletion?.email}</span>, including account,
              auth, watches, watch photos, vault metadata, AI usage, and submitted feedback. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(isDeletingUserId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSingleUser}
              disabled={Boolean(isDeletingUserId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingUserId ? "Deleting…" : "Yes, Delete User Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
