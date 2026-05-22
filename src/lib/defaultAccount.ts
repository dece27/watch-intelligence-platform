import {
  ADMIN_EMAIL,
  LEGACY_ADMIN_EMAILS,
  PROTECTED_ADMIN_USER_ID_KEY,
  ensureUserIndexed,
} from "@/lib/adminAnalytics"
import { hashPassword } from "@/lib/auth"
import { AuthRecord, User, Watch } from "@/lib/types"

export const DEFAULT_ACCOUNT_EMAIL = ADMIN_EMAIL
const DEFAULT_ACCOUNT_NAME = "Administrator"
const DEFAULT_ACCOUNT_VAULT_NAME = "WatchVault"
const DEFAULT_ACCOUNT_PASSWORD = "WatchVault"
const WATCH_PHOTO_KEY_PREFIX = "watch_photo_"
const WATCH_PHOTO_REF_PREFIX = "kv-photo:"

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function getWatchPhotoKey(userId: string, watchId: string): string {
  return `${WATCH_PHOTO_KEY_PREFIX}${userId}_${watchId}`
}

async function deleteUserCompletely(user: User, allUserIds: string[]): Promise<string[]> {
  const userId = user.id
  const watches = await window.spark.kv.get<Watch[]>(`watches_${userId}`) || []
  await Promise.all(
    watches
      .filter((watch) => watch.imageUrl?.startsWith(WATCH_PHOTO_REF_PREFIX))
      .map((watch) => {
        const watchId = watch.imageUrl!.slice(WATCH_PHOTO_REF_PREFIX.length)
        return window.spark.kv.delete(getWatchPhotoKey(userId, watchId))
      })
  )

  await Promise.all([
    window.spark.kv.delete(`user_${userId}`),
    window.spark.kv.delete(`auth_${userId}`),
    window.spark.kv.delete(`watches_${userId}`),
    window.spark.kv.delete(`ai_usage_${userId}`),
    window.spark.kv.delete(`vaultMetadata_${userId}`),
    window.spark.kv.delete(`user_email_${normalizeEmail(user.email)}`),
  ])

  return allUserIds.filter((id) => id !== userId)
}

export async function ensureDefaultAccount() {
  const normalizedEmail = normalizeEmail(DEFAULT_ACCOUNT_EMAIL)
  const emailKey = `user_email_${normalizedEmail}`
  const createdAt = new Date().toISOString()

  let userId = await window.spark.kv.get<string>(emailKey)
  let existingUser = userId ? await window.spark.kv.get<User>(`user_${userId}`) : null

  if (!userId || !existingUser) {
    userId = userId || crypto.randomUUID()
    existingUser = {
      id: userId,
      name: DEFAULT_ACCOUNT_NAME,
      email: normalizedEmail,
      vaultName: DEFAULT_ACCOUNT_VAULT_NAME,
      createdAt: createdAt,
    }
    await window.spark.kv.set(emailKey, userId)
  }
  await window.spark.kv.set(`user_${userId}`, {
    id: userId,
    name: DEFAULT_ACCOUNT_NAME,
    email: normalizedEmail,
    vaultName: DEFAULT_ACCOUNT_VAULT_NAME,
    createdAt: existingUser.createdAt || createdAt,
    avatarUrl: existingUser.avatarUrl,
  } satisfies User)

  const passwordPayload = await hashPassword(DEFAULT_ACCOUNT_PASSWORD)
  const currentAuth = await window.spark.kv.get<AuthRecord>(`auth_${userId}`)
  await window.spark.kv.set(`auth_${userId}`, {
    userId,
    ...passwordPayload,
    failedAttempts: 0,
    loginCount: currentAuth?.loginCount || 0,
    lastLoginAt: currentAuth?.lastLoginAt,
  } satisfies AuthRecord)

  await window.spark.kv.set(PROTECTED_ADMIN_USER_ID_KEY, userId)
  await ensureUserIndexed(userId)

  const legacyAdminEmails = new Set(
    LEGACY_ADMIN_EMAILS.map(normalizeEmail).filter((email) => email && email !== normalizedEmail)
  )
  if (legacyAdminEmails.size === 0) {
    return
  }

  let userIds = await window.spark.kv.get<string[]>("all_user_ids") || []
  for (const candidateUserId of userIds) {
    if (candidateUserId === userId) continue
    const user = await window.spark.kv.get<User>(`user_${candidateUserId}`)
    if (!user) {
      userIds = userIds.filter((id) => id !== candidateUserId)
      continue
    }

    if (legacyAdminEmails.has(normalizeEmail(user.email))) {
      userIds = await deleteUserCompletely(user, userIds)
    }
  }

  await window.spark.kv.set("all_user_ids", userIds)
}
