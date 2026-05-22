import { hashPassword } from "@/lib/auth"
import { ensureUserIndexed } from "@/lib/adminAnalytics"
import { AuthRecord, User } from "@/lib/types"

export const DEFAULT_ACCOUNT_EMAIL = "dec.davide@gmail.com"
const DEFAULT_ACCOUNT_PASSWORD = "WatchVault"
const DEFAULT_ACCOUNT_NAME = "Davide"
const DEFAULT_ACCOUNT_VAULT_NAME = "WatchVault"

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function ensureDefaultAccount() {
  const normalizedEmail = normalizeEmail(DEFAULT_ACCOUNT_EMAIL)
  const emailKey = `user_email_${normalizedEmail}`
  const createdAt = new Date().toISOString()

  let userId = await window.spark.kv.get<string>(emailKey)
  const existingUser = userId ? await window.spark.kv.get<User>(`user_${userId}`) : null

  if (!userId || !existingUser) {
    userId = existingUser?.id || crypto.randomUUID()
    const user: User = {
      id: userId,
      name: DEFAULT_ACCOUNT_NAME,
      email: normalizedEmail,
      vaultName: DEFAULT_ACCOUNT_VAULT_NAME,
      createdAt: existingUser?.createdAt || createdAt,
      avatarUrl: existingUser?.avatarUrl,
    }
    await window.spark.kv.set(emailKey, userId)
    await window.spark.kv.set(`user_${userId}`, user)
  }

  const currentAuth = await window.spark.kv.get<AuthRecord>(`auth_${userId}`)
  const passwordPayload = await hashPassword(DEFAULT_ACCOUNT_PASSWORD)
  await window.spark.kv.set(`auth_${userId}`, {
    userId,
    ...passwordPayload,
    failedAttempts: 0,
    loginCount: currentAuth?.loginCount || 0,
    lastLoginAt: currentAuth?.lastLoginAt,
  } satisfies AuthRecord)

  await ensureUserIndexed(userId)
}
