import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, TableInsert, TableRow, TableUpdate } from '@/lib/supabase/types'

export interface WatchRecord {
  id: string
  userId: string
  brand: string
  model?: string
  reference: string
  year?: number
  condition?: Database['public']['Enums']['watch_condition']
  hasBox: boolean
  hasPapers: boolean
  purchasePrice?: number
  purchaseDate?: string
  purchaseCurrency?: string
  serialNumber?: string
  notes?: string
  coverPhotoUrl?: string
  isSold: boolean
  soldPrice?: number
  soldDate?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
}

export interface WatchInput extends Omit<WatchRecord, 'createdAt' | 'updatedAt'> {
  id?: string
}

export interface WatchPhotoRecord {
  id: string
  watchId: string
  userId: string
  storagePath: string
  url: string
  isCover: boolean
  position: number
  width?: number
  height?: number
  sizeBytes?: number
  createdAt: string
}

export interface WatchPhotoInput extends Omit<WatchPhotoRecord, 'createdAt'> {
  id?: string
}

export interface WatchServiceRecord {
  id: string
  watchId: string
  userId: string
  serviceDate: string
  serviceType: string
  watchmaker?: string
  location?: string
  cost?: number
  currency?: string
  notes?: string
  warrantyUntil?: string
  createdAt: string
  updatedAt: string
}

export interface WatchServiceInput extends Omit<WatchServiceRecord, 'createdAt' | 'updatedAt'> {
  id?: string
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapWatch(row: TableRow<'watches'>): WatchRecord {
  return {
    id: row.id,
    userId: row.user_id,
    brand: row.brand,
    model: row.model ?? undefined,
    reference: row.reference,
    year: row.year ?? undefined,
    condition: row.condition ?? undefined,
    hasBox: row.has_box,
    hasPapers: row.has_papers,
    purchasePrice: row.purchase_price ?? undefined,
    purchaseDate: row.purchase_date ?? undefined,
    purchaseCurrency: row.purchase_currency ?? undefined,
    serialNumber: row.serial_number ?? undefined,
    notes: row.notes ?? undefined,
    coverPhotoUrl: row.cover_photo_url ?? undefined,
    isSold: row.is_sold,
    soldPrice: row.sold_price ?? undefined,
    soldDate: row.sold_date ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toWatchInsert(watch: WatchInput): TableInsert<'watches'> {
  return {
    id: watch.id,
    user_id: watch.userId,
    brand: watch.brand,
    model: watch.model ?? null,
    reference: watch.reference,
    year: watch.year ?? null,
    condition: watch.condition ?? null,
    has_box: watch.hasBox,
    has_papers: watch.hasPapers,
    purchase_price: watch.purchasePrice ?? null,
    purchase_date: watch.purchaseDate ?? null,
    purchase_currency: watch.purchaseCurrency ?? 'USD',
    serial_number: watch.serialNumber ?? null,
    notes: watch.notes ?? null,
    cover_photo_url: watch.coverPhotoUrl ?? null,
    is_sold: watch.isSold,
    sold_price: watch.soldPrice ?? null,
    sold_date: watch.soldDate ?? null,
    deleted_at: watch.deletedAt ?? null,
  }
}

function toWatchUpdate(watch: Partial<WatchInput>): TableUpdate<'watches'> {
  return {
    brand: watch.brand,
    model: watch.model ?? null,
    reference: watch.reference,
    year: watch.year ?? null,
    condition: watch.condition ?? null,
    has_box: watch.hasBox,
    has_papers: watch.hasPapers,
    purchase_price: watch.purchasePrice ?? null,
    purchase_date: watch.purchaseDate ?? null,
    purchase_currency: watch.purchaseCurrency ?? null,
    serial_number: watch.serialNumber ?? null,
    notes: watch.notes ?? null,
    cover_photo_url: watch.coverPhotoUrl ?? null,
    is_sold: watch.isSold,
    sold_price: watch.soldPrice ?? null,
    sold_date: watch.soldDate ?? null,
    deleted_at: watch.deletedAt ?? null,
  }
}

function mapWatchPhoto(row: TableRow<'watch_photos'>): WatchPhotoRecord {
  return {
    id: row.id,
    watchId: row.watch_id,
    userId: row.user_id,
    storagePath: row.storage_path,
    url: row.url,
    isCover: row.is_cover ?? false,
    position: row.position ?? 0,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    createdAt: row.created_at,
  }
}

function toWatchPhotoInsert(photo: WatchPhotoInput): TableInsert<'watch_photos'> {
  return {
    id: photo.id,
    watch_id: photo.watchId,
    user_id: photo.userId,
    storage_path: photo.storagePath,
    url: photo.url,
    is_cover: photo.isCover,
    position: photo.position,
    width: photo.width ?? null,
    height: photo.height ?? null,
    size_bytes: photo.sizeBytes ?? null,
  }
}

function mapServiceRecord(row: TableRow<'watch_service_records'>): WatchServiceRecord {
  return {
    id: row.id,
    watchId: row.watch_id,
    userId: row.user_id,
    serviceDate: row.service_date,
    serviceType: row.service_type,
    watchmaker: row.watchmaker ?? undefined,
    location: row.location ?? undefined,
    cost: row.cost ?? undefined,
    currency: row.currency ?? undefined,
    notes: row.notes ?? undefined,
    warrantyUntil: row.warranty_until ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toServiceInsert(record: WatchServiceInput): TableInsert<'watch_service_records'> {
  return {
    id: record.id,
    watch_id: record.watchId,
    user_id: record.userId,
    service_date: record.serviceDate,
    service_type: record.serviceType,
    watchmaker: record.watchmaker ?? null,
    location: record.location ?? null,
    cost: record.cost ?? null,
    currency: record.currency ?? 'USD',
    notes: record.notes ?? null,
    warranty_until: record.warrantyUntil ?? null,
  }
}

export async function listWatches(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  options?: { includeDeleted?: boolean },
): Promise<WatchRecord[]> {
  let query = client
    .from('watches')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (!options?.includeDeleted) {
    query = query.is('deleted_at', null)
  }

  const { data, error } = await query
  throwIfError(error)
  return (data ?? []).map(mapWatch)
}

export async function upsertWatch(client: Pick<SupabaseClient<Database>, 'from'>, watch: WatchInput): Promise<WatchRecord> {
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
  watch: Partial<WatchInput>,
): Promise<WatchRecord> {
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

export async function softDeleteWatch(client: Pick<SupabaseClient<Database>, 'from'>, userId: string, watchId: string): Promise<void> {
  const { error } = await client
    .from('watches')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', watchId)

  throwIfError(error)
}

export async function listWatchPhotos(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  watchId: string,
): Promise<WatchPhotoRecord[]> {
  const { data, error } = await client
    .from('watch_photos')
    .select('*')
    .eq('user_id', userId)
    .eq('watch_id', watchId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  throwIfError(error)
  return (data ?? []).map(mapWatchPhoto)
}

export async function upsertWatchPhoto(client: Pick<SupabaseClient<Database>, 'from'>, photo: WatchPhotoInput): Promise<WatchPhotoRecord> {
  const { data, error } = await client
    .from('watch_photos')
    .upsert(toWatchPhotoInsert(photo), { onConflict: 'id' })
    .select('*')
    .single()

  throwIfError(error)
  return mapWatchPhoto(data)
}

export async function listWatchServiceRecords(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  watchId: string,
): Promise<WatchServiceRecord[]> {
  const { data, error } = await client
    .from('watch_service_records')
    .select('*')
    .eq('user_id', userId)
    .eq('watch_id', watchId)
    .order('service_date', { ascending: false })

  throwIfError(error)
  return (data ?? []).map(mapServiceRecord)
}

export async function createWatchServiceRecord(
  client: Pick<SupabaseClient<Database>, 'from'>,
  record: WatchServiceInput,
): Promise<WatchServiceRecord> {
  const { data, error } = await client
    .from('watch_service_records')
    .insert(toServiceInsert(record))
    .select('*')
    .single()

  throwIfError(error)
  return mapServiceRecord(data)
}
