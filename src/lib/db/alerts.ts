import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, TableInsert, TableRow, ViewRow } from '@/lib/supabase/types'

export interface PriceAlertRecord {
  id: string
  userId: string
  watchId?: string
  watchRef: string
  brand: string
  model: string
  condition: 'above' | 'below'
  targetPrice: number
  createdAt: string
  updatedAt: string
}

export interface ActivePriceAlert extends PriceAlertRecord {
  currentValue?: number
  purchasePrice?: number
}

export interface PriceAlertInput {
  id?: string
  userId: string
  watchId?: string
  watchRef: string
  brand: string
  model: string
  condition: 'above' | 'below'
  targetPrice: number
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapAlert(row: TableRow<'price_alerts'>): PriceAlertRecord {
  return {
    id: row.id,
    userId: row.user_id,
    watchId: row.watch_id ?? undefined,
    watchRef: row.watch_ref,
    brand: row.brand,
    model: row.model,
    condition: row.condition,
    targetPrice: row.target_price,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapActiveAlert(row: ViewRow<'active_price_alerts'>): ActivePriceAlert {
  return {
    id: row.id,
    userId: row.user_id,
    watchId: row.watch_id ?? undefined,
    watchRef: row.watch_ref,
    brand: row.brand,
    model: row.model,
    condition: row.condition,
    targetPrice: row.target_price,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentValue: row.current_value ?? undefined,
    purchasePrice: row.purchase_price ?? undefined,
  }
}

function toInsert(alert: PriceAlertInput): TableInsert<'price_alerts'> {
  return {
    id: alert.id,
    user_id: alert.userId,
    watch_id: alert.watchId ?? null,
    watch_ref: alert.watchRef,
    brand: alert.brand,
    model: alert.model,
    condition: alert.condition,
    target_price: alert.targetPrice,
  }
}

export async function listPriceAlerts(client: Pick<SupabaseClient<Database>, 'from'>, userId: string): Promise<PriceAlertRecord[]> {
  const { data, error } = await client
    .from('price_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  throwIfError(error)
  return (data ?? []).map(mapAlert)
}

export async function listActivePriceAlerts(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
): Promise<ActivePriceAlert[]> {
  const { data, error } = await client
    .from('active_price_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  throwIfError(error)
  return (data ?? []).map(mapActiveAlert)
}

export async function upsertPriceAlert(client: Pick<SupabaseClient<Database>, 'from'>, alert: PriceAlertInput): Promise<PriceAlertRecord> {
  const { data, error } = await client
    .from('price_alerts')
    .upsert(toInsert(alert), { onConflict: 'id' })
    .select('*')
    .single()

  throwIfError(error)
  return mapAlert(data)
}

export async function deletePriceAlert(client: Pick<SupabaseClient<Database>, 'from'>, userId: string, alertId: string): Promise<void> {
  const { error } = await client
    .from('price_alerts')
    .delete()
    .eq('user_id', userId)
    .eq('id', alertId)

  throwIfError(error)
}
