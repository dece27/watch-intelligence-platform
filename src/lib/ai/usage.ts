import type { User } from '@/lib/types'
import { recordAiUsage as recordAiUsageRpc } from '@/lib/db/ai-usage'
import { getSupabaseClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client'

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

async function getSupabaseSessionUserId(): Promise<string | null> {
  if (!hasSupabaseBrowserEnv()) {
    return null
  }

  try {
    const {
      data: { session },
    } = await getSupabaseClient().auth.getSession()
    return session?.user.id ?? null
  } catch {
    return null
  }
}

export async function resolveCurrentUserId(): Promise<string | null> {
  const supabaseUserId = await getSupabaseSessionUserId()
  if (supabaseUserId) {
    return supabaseUserId
  }

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
  const tokensUsed = estimateTokenCount(prompt) + estimateTokenCount(response)

  if (hasSupabaseBrowserEnv()) {
    const supabaseUserId = await getSupabaseSessionUserId()
    if (supabaseUserId && supabaseUserId === userId) {
      try {
        await recordAiUsageRpc(getSupabaseClient(), 'general', tokensUsed)
        if (typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent(AI_USAGE_UPDATED_EVENT))
        }
        return
      } catch {
        // Fall through to KV persistence when Supabase is temporarily unavailable.
      }
    }
  }

  const usageKey = `ai_usage_${userId}`
  const existing = await window.spark.kv.get<UserAIUsage>(usageKey)
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
