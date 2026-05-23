import { User } from "@/lib/types"

export const ADMIN_EMAIL = "administrator"
export const LEGACY_ADMIN_EMAILS = ["dec.davide@gmail.com"]
export const PROTECTED_ADMIN_USER_ID_KEY = "protected_admin_user_id"
const ALL_USER_IDS_KEY = "all_user_ids"

export interface UserAIUsage {
  userId: string
  aiTokensUsed: number
  aiRequestsCount: number
  lastUsedAt?: string
}

export const isAdminEmail = (email?: string) =>
  Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL)

export const isProtectedAdminUser = (
  user: Pick<User, "id" | "email"> | null | undefined,
  protectedAdminUserId?: string | null
) => {
  if (!user) return false
  if (protectedAdminUserId && user.id === protectedAdminUserId) return true
  return isAdminEmail(user.email)
}

export async function ensureUserIndexed(userId: string) {
  const ids = await window.spark.kv.get<unknown>(ALL_USER_IDS_KEY)
  const allIds = Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string")
    : []
  if (!allIds.includes(userId)) {
    await window.spark.kv.set(ALL_USER_IDS_KEY, [...allIds, userId])
  }
}

const estimateTokenCount = (text: string) => Math.ceil(new TextEncoder().encode(text).length / 4)

const resolveCurrentUserId = async (): Promise<string | null> => {
  try {
    const persisted = await window.spark.kv.get<User>("currentUser")
    if (persisted?.id) return persisted.id
  } catch {
    // noop
  }

  try {
    const session = sessionStorage.getItem("currentUserSession")
    if (!session) return null
    const parsed = JSON.parse(session) as User
    return parsed?.id || null
  } catch {
    return null
  }
}

export async function recordAiUsage(userId: string, prompt: string, response: string) {
  const usageKey = `ai_usage_${userId}`
  const existing = await window.spark.kv.get<UserAIUsage>(usageKey)
  const tokensUsed = estimateTokenCount(prompt) + estimateTokenCount(response)

  await window.spark.kv.set(usageKey, {
    userId,
    aiTokensUsed: (existing?.aiTokensUsed || 0) + tokensUsed,
    aiRequestsCount: (existing?.aiRequestsCount || 0) + 1,
    lastUsedAt: new Date().toISOString(),
  } satisfies UserAIUsage)
}

export async function callTrackedLlm(prompt: string, model: string, jsonMode?: boolean) {
  const response = await window.spark.llm(prompt, model, jsonMode)
  const userId = await resolveCurrentUserId()
  if (userId) {
    await recordAiUsage(userId, prompt, response)
  }
  return response
}
