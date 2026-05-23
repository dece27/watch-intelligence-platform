import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Watch } from '@/lib/types'
import type { Database, TableInsert, TableRow, TableUpdate } from '@/lib/supabase/types'

export interface PersistedWatch extends Watch {
  userId: string
  imagePath?: string
  createdAt: string
  updatedAt: string
}

export interface PersistedWatchInput extends Watch {
  userId: string
  imagePath?: string
}

function mapWatch(row: TableRow<'watches'>): PersistedWatch {
  return {
    id: row.id,
    userId: row.user_id,
    brand: row.brand,
    model: row.model,
    referenceNumber: row.reference_number ?? undefined,
    serialNumber: row.serial_number ?? undefined,
    year: row.year ?? undefined,
    purchasePrice: row.purchase_price,
    purchaseDate: row.purchase_date,
    currentValue: row.current_value ?? undefined,
    condition: row.condition,
    category: row.category,
    imageUrl: row.image_path ?? undefined,
    imagePath: row.image_path ?? undefined,
    movement: row.movement ?? undefined,
    caseMaterial: row.case_material ?? undefined,
    caseDiameter: row.case_diameter ?? undefined,
    notes: row.notes ?? undefined,
    hasBox: row.has_box,
    hasPapers: row.has_papers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toWatchInsert(watch: PersistedWatchInput): TableInsert<'watches'> {
  return {
    id: watch.id,
    user_id: watch.userId,
    brand: watch.brand,
    model: watch.model,
    reference_number: watch.referenceNumber ?? null,
    serial_number: watch.serialNumber ?? null,
    year: watch.year ?? null,
    purchase_price: watch.purchasePrice,
    purchase_date: watch.purchaseDate,
    current_value: watch.currentValue ?? null,
    condition: watch.condition,
    category: watch.category,
    image_path: watch.imagePath ?? watch.imageUrl ?? null,
    movement: watch.movement ?? null,
    case_material: watch.caseMaterial ?? null,
    case_diameter: watch.caseDiameter ?? null,
    notes: watch.notes ?? null,
    has_box: watch.hasBox ?? false,
    has_papers: watch.hasPapers ?? false,
  }
}

function toWatchUpdate(watch: Partial<PersistedWatchInput>): TableUpdate<'watches'> {
  return {
    brand: watch.brand,
    model: watch.model,
    reference_number: watch.referenceNumber ?? null,
    serial_number: watch.serialNumber ?? null,
    year: watch.year ?? null,
    purchase_price: watch.purchasePrice,
    purchase_date: watch.purchaseDate,
    current_value: watch.currentValue ?? null,
    condition: watch.condition,
    category: watch.category,
    image_path: watch.imagePath ?? watch.imageUrl ?? null,
    movement: watch.movement ?? null,
    case_material: watch.caseMaterial ?? null,
    case_diameter: watch.caseDiameter ?? null,
    notes: watch.notes ?? null,
    has_box: watch.hasBox,
    has_papers: watch.hasPapers,
  }
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

export async function listWatches(client: Pick<SupabaseClient<Database>, 'from'>, userId: string): Promise<PersistedWatch[]> {
  const { data, error } = await client
    .from('watches')
    .select('*')
    .eq('user_id', userId)
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })

  throwIfError(error)
  return (data ?? []).map(mapWatch)
}

export async function getWatch(client: Pick<SupabaseClient<Database>, 'from'>, userId: string, watchId: string): Promise<PersistedWatch | null> {
  const { data, error } = await client
    .from('watches')
    .select('*')
    .eq('user_id', userId)
    .eq('id', watchId)
    .maybeSingle()

  throwIfError(error)
  return data ? mapWatch(data) : null
}

export async function upsertWatch(client: Pick<SupabaseClient<Database>, 'from'>, watch: PersistedWatchInput): Promise<PersistedWatch> {
  const { data, error } = await client
    .from('watches')
    .upsert(toWatchInsert(watch), { onConflict: 'id' })
    .select('*')
    .single()

  throwIfError(error)
  return mapWatch(data)
}

export async function updateWatch(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  watchId: string,
  watch: Partial<PersistedWatchInput>,
): Promise<PersistedWatch> {
  const { data, error } = await client
    .from('watches')
    .update(toWatchUpdate(watch))
    .eq('user_id', userId)
    .eq('id', watchId)
    .select('*')
    .single()

  throwIfError(error)
  return mapWatch(data)
}

export async function deleteWatch(client: Pick<SupabaseClient<Database>, 'from'>, userId: string, watchId: string): Promise<void> {
  const { error } = await client
    .from('watches')
    .delete()
    .eq('user_id', userId)
    .eq('id', watchId)

  throwIfError(error)
}
