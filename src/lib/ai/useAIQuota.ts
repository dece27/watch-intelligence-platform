import { useEffect, useState } from 'react'
import { listAiUsageLogs } from '@/lib/db/ai-usage'
import { installSparkKVFallback } from '@/lib/sparkKV'
import { getSupabaseClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client'
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

const mapUsageLogsToUsage = (userId: string, logs: Awaited<ReturnType<typeof listAiUsageLogs>>): UserAIUsage => {
  const usageDate = getAiUsageDateKey()
  const todaysLogs = logs.filter((log) => log.usageDate === usageDate)

  return {
    userId,
    aiTokensUsed: logs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0),
    aiRequestsCount: logs.reduce((sum, log) => sum + log.callCount, 0),
    dailyRequestsUsed: todaysLogs.reduce((sum, log) => sum + log.callCount, 0),
    usageDate,
    lastUsedAt: logs[0]?.createdAt,
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

        if (hasSupabaseBrowserEnv()) {
          try {
            const usageLogs = await listAiUsageLogs(getSupabaseClient(), activeUserId)
            updateFromUsage(mapUsageLogsToUsage(activeUserId, usageLogs))
            return
          } catch {
            // Fall back to KV below when Supabase usage cannot be read.
          }
        }

        const usage = await window.spark.kv.get<UserAIUsage>(`ai_usage_${activeUserId}`)
        updateFromUsage(usage)
      } catch {
        updateFromUsage(undefined)
      }
    }

    const handleUsageUpdated = () => {
      void loadQuota()
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
