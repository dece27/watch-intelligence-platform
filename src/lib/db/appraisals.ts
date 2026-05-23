import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, TableInsert, TableRow } from '@/lib/supabase/types'

export interface AppraisalRecord {
  id: string
  userId: string
  watchIds: string[]
  purpose: Database['public']['Enums']['appraisal_purpose']
  appraiserName?: string
  pdfUrl?: string
  storagePath?: string
  totalValue?: number
  currency?: string
  reportData?: Json
  generatedAt: string
}

export interface AppraisalInput extends Omit<AppraisalRecord, 'generatedAt'> {
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
    watchIds: row.watch_ids,
    purpose: row.purpose,
    appraiserName: row.appraiser_name ?? undefined,
    pdfUrl: row.pdf_url ?? undefined,
    storagePath: row.storage_path ?? undefined,
    totalValue: row.total_value ?? undefined,
    currency: row.currency ?? undefined,
    reportData: row.report_data ?? undefined,
    generatedAt: row.generated_at,
  }
}

function toInsert(appraisal: AppraisalInput): TableInsert<'appraisals'> {
  return {
    id: appraisal.id,
    user_id: appraisal.userId,
    watch_ids: appraisal.watchIds,
    purpose: appraisal.purpose,
    appraiser_name: appraisal.appraiserName ?? null,
    pdf_url: appraisal.pdfUrl ?? null,
    storage_path: appraisal.storagePath ?? null,
    total_value: appraisal.totalValue ?? null,
    currency: appraisal.currency ?? 'USD',
    report_data: appraisal.reportData ?? null,
    generated_at: appraisal.generatedAt,
  }
}

export async function listAppraisals(client: Pick<SupabaseClient<Database>, 'from'>, userId: string): Promise<AppraisalRecord[]> {
  const { data, error } = await client
    .from('appraisals')
    .select('*')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })

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
