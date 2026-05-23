import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, TableRow } from '@/lib/supabase/types'

export interface AiUsageRecord {
  userId: string
  aiTokensUsed: number
  aiRequestsCount: number
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapUsage(row: TableRow<'ai_usage'>): AiUsageRecord {
  return {
    userId: row.user_id,
    aiTokensUsed: row.ai_tokens_used,
    aiRequestsCount: row.ai_requests_count,
    lastUsedAt: row.last_used_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getAiUsage(client: Pick<SupabaseClient<Database>, 'from'>, userId: string): Promise<AiUsageRecord | null> {
  const { data, error } = await client
    .from('ai_usage')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  throwIfError(error)
  return data ? mapUsage(data) : null
}

export async function recordAiUsage(
  client: Pick<SupabaseClient<Database>, 'rpc'>,
  tokens: number,
  requests = 1,
): Promise<AiUsageRecord> {
  const { data, error } = await client.rpc('record_ai_usage', {
    p_tokens: tokens,
    p_requests: requests,
  })

  throwIfError(error)
  const usage = (data ?? [])[0]
  if (!usage) {
    throw new Error('Failed to record AI usage')
  }

  return mapUsage(usage)
}
