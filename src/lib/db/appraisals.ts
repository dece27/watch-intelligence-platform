import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, TableInsert, TableRow } from '@/lib/supabase/types'

export interface AppraisalRecord {
  id: string
  userId: string
  watchId: string
  appraisedValue: number
  replacementValue?: number
  currency: string
  appraisalText?: string
  appraisalPayload: Record<string, unknown>
  generatedAt: string
  createdAt: string
}

export interface AppraisalInput {
  id?: string
  userId: string
  watchId: string
  appraisedValue: number
  replacementValue?: number
  currency?: string
  appraisalText?: string
  appraisalPayload?: Record<string, unknown>
  generatedAt?: string
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapAppraisal(row: TableRow<'appraisals'>): AppraisalRecord {
  return {
    id: row.id,
    userId: row.user_id,
    watchId: row.watch_id,
    appraisedValue: row.appraised_value,
    replacementValue: row.replacement_value ?? undefined,
    currency: row.currency,
    appraisalText: row.appraisal_text ?? undefined,
    appraisalPayload: (row.appraisal_payload as Record<string, unknown>) ?? {},
    generatedAt: row.generated_at,
    createdAt: row.created_at,
  }
}

function toInsert(appraisal: AppraisalInput): TableInsert<'appraisals'> {
  return {
    id: appraisal.id,
    user_id: appraisal.userId,
    watch_id: appraisal.watchId,
    appraised_value: appraisal.appraisedValue,
    replacement_value: appraisal.replacementValue ?? null,
    currency: appraisal.currency ?? 'USD',
    appraisal_text: appraisal.appraisalText ?? null,
    appraisal_payload: appraisal.appraisalPayload ?? {},
    generated_at: appraisal.generatedAt,
  }
}

export async function listAppraisals(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  watchId?: string,
): Promise<AppraisalRecord[]> {
  let query = client
    .from('appraisals')
    .select('*')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })

  if (watchId) {
    query = query.eq('watch_id', watchId)
  }

  const { data, error } = await query
  throwIfError(error)
  return (data ?? []).map(mapAppraisal)
}

export async function createAppraisal(
  client: Pick<SupabaseClient<Database>, 'from'>,
  appraisal: AppraisalInput,
): Promise<AppraisalRecord> {
  const { data, error } = await client
    .from('appraisals')
    .insert(toInsert(appraisal))
    .select('*')
    .single()

  throwIfError(error)
  return mapAppraisal(data)
}
