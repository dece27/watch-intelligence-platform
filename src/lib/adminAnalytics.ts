import { callAI } from '@/lib/ai/caller'
export { recordAiUsage } from '@/lib/ai/usage'
export type { UserAIUsage } from '@/lib/ai/usage'
import type { User } from "@/lib/types"
import type { GitHubModelsTaskType } from '@/lib/github-models-proxy'

export const ADMIN_EMAIL = "administrator"
export const LEGACY_ADMIN_EMAILS = ["dec.davide@gmail.com"]
export const PROTECTED_ADMIN_USER_ID_KEY = "protected_admin_user_id"
const ALL_USER_IDS_KEY = "all_user_ids"

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

export async function callTrackedLlm(
  prompt: string,
  model = 'auto',
  jsonMode?: boolean,
  taskType: GitHubModelsTaskType = 'general',
) {
  return callAI({ prompt, model, jsonMode, taskType })
}
