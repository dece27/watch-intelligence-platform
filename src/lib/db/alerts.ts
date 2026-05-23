import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, TableInsert, TableRow, ViewRow } from '@/lib/supabase/types'

export interface PriceAlertRecord {
  id: string
  userId: string
  brand: string
  reference: string
  direction: Database['public']['Enums']['alert_direction']
  targetPrice: number
  currency?: string
  isActive: boolean
  lastChecked?: string
  triggeredAt?: string
  triggerPrice?: number
  notifiedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ActivePriceAlert extends PriceAlertRecord {
  currentPriceUsd?: number
  marketRecordedAt?: string
}

export type PriceAlertInput = Omit<PriceAlertRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapAlert(row: TableRow<'price_alerts'>): PriceAlertRecord {
  return {
    id: row.id,
    userId: row.user_id,
    brand: row.brand,
    reference: row.reference,
    direction: row.direction,
    targetPrice: row.target_price,
    currency: row.currency ?? undefined,
    isActive: row.is_active,
    lastChecked: row.last_checked ?? undefined,
    triggeredAt: row.triggered_at ?? undefined,
    triggerPrice: row.trigger_price ?? undefined,
    notifiedAt: row.notified_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapActiveAlert(row: ViewRow<'active_price_alerts'>): ActivePriceAlert {
  return {
    id: row.id,
    userId: row.user_id,
    brand: row.brand,
    reference: row.reference,
    direction: row.direction,
    targetPrice: row.target_price,
    currency: row.currency ?? undefined,
    isActive: row.is_active,
    lastChecked: row.last_checked ?? undefined,
    triggeredAt: row.triggered_at ?? undefined,
    triggerPrice: row.trigger_price ?? undefined,
    notifiedAt: row.notified_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentPriceUsd: row.current_price_usd ?? undefined,
    marketRecordedAt: row.market_recorded_at ?? undefined,
  }
}

function toInsert(alert: PriceAlertInput): TableInsert<'price_alerts'> {
  return {
    id: alert.id,
    user_id: alert.userId,
    brand: alert.brand,
    reference: alert.reference,
    direction: alert.direction,
    target_price: alert.targetPrice,
    currency: alert.currency ?? 'USD',
    is_active: alert.isActive,
    last_checked: alert.lastChecked ?? null,
    triggered_at: alert.triggeredAt ?? null,
    trigger_price: alert.triggerPrice ?? null,
    notified_at: alert.notifiedAt ?? null,
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
