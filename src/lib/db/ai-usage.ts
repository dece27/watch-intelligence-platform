import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, TableRow } from '@/lib/supabase/types'

export interface AiUsageLogRecord {
  id: string
  userId: string
  usageDate: string
  callType: string
  callCount: number
  tokensUsed?: number
  createdAt: string
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapUsage(row: TableRow<'ai_usage_logs'>): AiUsageLogRecord {
  return {
    id: row.id,
    userId: row.user_id,
    usageDate: row.usage_date,
    callType: row.call_type,
    callCount: row.call_count,
    tokensUsed: row.tokens_used ?? undefined,
    createdAt: row.created_at,
  }
}

export async function listAiUsageLogs(client: Pick<SupabaseClient<Database>, 'from'>, userId: string): Promise<AiUsageLogRecord[]> {
  const { data, error } = await client
    .from('ai_usage_logs')
    .select('*')
    .eq('user_id', userId)
    .order('usage_date', { ascending: false })
    .order('created_at', { ascending: false })

  throwIfError(error)
  return (data ?? []).map(mapUsage)
}

export async function recordAiUsage(
  client: Pick<SupabaseClient<Database>, 'rpc'>,
  callType: string,
  tokens?: number,
  usageDate?: string,
  increment = 1,
): Promise<AiUsageLogRecord> {
  const { data, error } = await client.rpc('record_ai_usage', {
    p_call_type: callType,
    p_tokens: tokens ?? null,
    p_usage_date: usageDate ?? null,
    p_increment: increment,
  })

  throwIfError(error)
  const usage = (data ?? [])[0]
  if (!usage) {
    throw new Error('Failed to record AI usage')
  }

  return mapUsage(usage)
}
