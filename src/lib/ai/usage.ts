import type { User } from '@/lib/types'

export interface UserAIUsage {
  userId: string
  aiTokensUsed: number
  aiRequestsCount: number
  lastUsedAt?: string
}

const estimateTokenCount = (text: string) => Math.ceil(new TextEncoder().encode(text).length / 4)

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

  await window.spark.kv.set(usageKey, {
    userId,
    aiTokensUsed: (existing?.aiTokensUsed || 0) + tokensUsed,
    aiRequestsCount: (existing?.aiRequestsCount || 0) + 1,
    lastUsedAt: new Date().toISOString(),
  } satisfies UserAIUsage)
}
