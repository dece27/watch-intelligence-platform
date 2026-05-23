import type { User } from '@/lib/types'

export interface UserAIUsage {
  userId: string
  aiTokensUsed: number
  aiRequestsCount: number
  dailyRequestsUsed?: number
  usageDate?: string
  lastUsedAt?: string
}

export const DEFAULT_DAILY_AI_QUOTA = 10
export const AI_USAGE_UPDATED_EVENT = 'ai-usage-updated'

const estimateTokenCount = (text: string) => Math.ceil(new TextEncoder().encode(text).length / 4)

export const getAiUsageDateKey = (date = new Date()) => date.toISOString().slice(0, 10)

export async function resolveCurrentUserId(): Promise<string | null> {
  try {
    const persisted = await window.spark.kv.get<User>('currentUser')
    if (persisted?.id) return persisted.id
  } catch {
    // noop
  }

  try {
    const session = sessionStorage.getItem('currentUserSession')
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
  const usageDate = getAiUsageDateKey()
  const nextUsage = {
    userId,
    aiTokensUsed: (existing?.aiTokensUsed || 0) + tokensUsed,
    aiRequestsCount: (existing?.aiRequestsCount || 0) + 1,
    dailyRequestsUsed: existing?.usageDate === usageDate
      ? (existing?.dailyRequestsUsed || 0) + 1
      : 1,
    usageDate,
    lastUsedAt: new Date().toISOString(),
  } satisfies UserAIUsage

  await window.spark.kv.set(usageKey, nextUsage)
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(AI_USAGE_UPDATED_EVENT, { detail: nextUsage }))
  }
}
