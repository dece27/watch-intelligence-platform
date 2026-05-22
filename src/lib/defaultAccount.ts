import { ensureUserIndexed } from "@/lib/adminAnalytics"
import { AuthRecord, User } from "@/lib/types"

export const DEFAULT_ACCOUNT_EMAIL = "dec.davide@gmail.com"
const DEFAULT_ACCOUNT_NAME = "Davide"
const DEFAULT_ACCOUNT_VAULT_NAME = "WatchVault"
const DEFAULT_ACCOUNT_AUTH_FALLBACK = {
  passwordHash: "weuoxzjRd14shhw7JHkha0V3vbQPpdqaBsvUA/7JoEA=",
  salt: "5r4LcnEAK3QTXFynTrHWww==",
  iterations: 210_000,
} as const

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function getDefaultAccountAuth(): Pick<AuthRecord, "passwordHash" | "salt" | "iterations"> {
  const envPasswordHash = import.meta.env.VITE_DEFAULT_ACCOUNT_PASSWORD_HASH?.trim()
  const envSalt = import.meta.env.VITE_DEFAULT_ACCOUNT_SALT?.trim()
  const envIterations = Number(import.meta.env.VITE_DEFAULT_ACCOUNT_ITERATIONS)
  if (envPasswordHash && envSalt && Number.isFinite(envIterations) && envIterations > 0) {
    return {
      passwordHash: envPasswordHash,
      salt: envSalt,
      iterations: envIterations,
    }
  }

  return DEFAULT_ACCOUNT_AUTH_FALLBACK
}

export async function ensureDefaultAccount() {
  const normalizedEmail = normalizeEmail(DEFAULT_ACCOUNT_EMAIL)
  const emailKey = `user_email_${normalizedEmail}`
  const createdAt = new Date().toISOString()

  let userId = await window.spark.kv.get<string>(emailKey)
  const existingUser = userId ? await window.spark.kv.get<User>(`user_${userId}`) : null

  if (!userId || !existingUser) {
    userId = userId || crypto.randomUUID()
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
  await window.spark.kv.set(`auth_${userId}`, {
    userId,
    ...getDefaultAccountAuth(),
    failedAttempts: 0,
    loginCount: currentAuth?.loginCount || 0,
    lastLoginAt: currentAuth?.lastLoginAt,
  } satisfies AuthRecord)

  await ensureUserIndexed(userId)
}
