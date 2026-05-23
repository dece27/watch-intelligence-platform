import { useEffect, useState } from 'react'
import { installSparkKVFallback } from '@/lib/sparkKV'
import {
  AI_USAGE_UPDATED_EVENT,
  DEFAULT_DAILY_AI_QUOTA,
  getAiUsageDateKey,
  resolveCurrentUserId,
  type UserAIUsage,
} from '@/lib/ai/usage'

interface AIQuotaState {
  loading: boolean
  limit: number
  used: number
  remaining: number
  percentUsed: number
}

const buildQuotaState = (usage?: UserAIUsage, limit = DEFAULT_DAILY_AI_QUOTA): AIQuotaState => {
  const used = usage?.usageDate === getAiUsageDateKey()
    ? Math.min(limit, usage?.dailyRequestsUsed || 0)
    : 0

  return {
    loading: false,
    limit,
    used,
    remaining: Math.max(limit - used, 0),
    percentUsed: limit > 0 ? Math.min((used / limit) * 100, 100) : 0,
  }
}

export function useAIQuota(limit = DEFAULT_DAILY_AI_QUOTA) {
  const [quota, setQuota] = useState<AIQuotaState>({
    loading: true,
    limit,
    used: 0,
    remaining: limit,
    percentUsed: 0,
  })

  useEffect(() => {
    installSparkKVFallback()
    let isCancelled = false
    let activeUserId: string | null = null

    const updateFromUsage = (usage?: UserAIUsage, targetLimit = limit) => {
      if (!isCancelled) {
        setQuota(buildQuotaState(usage, targetLimit))
      }
    }

    const loadQuota = async () => {
      try {
        activeUserId = await resolveCurrentUserId()
        if (!activeUserId) {
          updateFromUsage(undefined)
          return
        }

        const usage = await window.spark.kv.get<UserAIUsage>(`ai_usage_${activeUserId}`)
        updateFromUsage(usage)
      } catch {
        updateFromUsage(undefined)
      }
    }

    const handleUsageUpdated = (event: Event) => {
      const detail = (event as CustomEvent<UserAIUsage>).detail
      if (!detail) return
      if (activeUserId && detail.userId !== activeUserId) return
      updateFromUsage(detail)
    }

    void loadQuota()
    window.addEventListener(AI_USAGE_UPDATED_EVENT, handleUsageUpdated)

    return () => {
      isCancelled = true
      window.removeEventListener(AI_USAGE_UPDATED_EVENT, handleUsageUpdated)
    }
  }, [limit])

  return quota
}
