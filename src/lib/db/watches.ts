import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type WatchRow = Database['public']['Tables']['watches']['Row']
export type WatchInsert = Database['public']['Tables']['watches']['Insert']
export type WatchUpdate = Database['public']['Tables']['watches']['Update']

export interface GetWatchesOptions {
  limit: number
  offset: number
  brand?: string
  includeDeleted?: boolean
}

const SEARCH_LIMIT = 25
const SEARCH_OFFSET = 0

type WatchClient = Pick<SupabaseClient<any>, 'from'>

function assertPagination(limit: number, offset: number): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Pagination limit must be a positive integer. Received: ${limit}`)
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error(`Pagination offset must be a non-negative integer. Received: ${offset}`)
  }
}

function throwDatabaseError(action: string, error: PostgrestError | null): void {
  if (error) {
    throw new Error(`Failed to ${action}: ${error.message}`)
  }
}

function requireWatch(row: WatchRow | null, id: string, action: string): WatchRow {
  if (!row) {
    throw new Error(`Failed to ${action}: watch ${id} was not found or is not accessible.`)
  }

  return row
}

function sanitizeSearchTerm(query: string): string {
  return query
    .trim()
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ')
}

function getClient(): WatchClient {
  return getSupabaseClient()
}

/**
 * Lists watches for a user with required pagination and optional brand/deleted filters.
 */
export async function getWatches(userId: string, options: GetWatchesOptions): Promise<WatchRow[]> {
  assertPagination(options.limit, options.offset)

  const client = getClient()
  let query = client
    .from('watches')
    .select('*')
    .eq('user_id', userId)

  if (options.brand) {
    query = query.eq('brand', options.brand.trim())
  }

  if (!options.includeDeleted) {
    query = query.is('deleted_at', null)
  }

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .range(options.offset, options.offset + options.limit - 1)

  throwDatabaseError('list watches', error)
  return data ?? []
}

/**
 * Fetches a single non-deleted watch visible to the current request context.
 */
export async function getWatch(id: string): Promise<WatchRow | null> {
  const client = getClient()
  const { data, error } = await client
    .from('watches')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  throwDatabaseError(`fetch watch ${id}`, error)
  return data
}

/**
 * Creates a watch row and returns the inserted database record.
 */
export async function createWatch(data: WatchInsert): Promise<WatchRow> {
  const client = getClient()
  const { data: createdWatch, error } = await client
    .from('watches')
    .insert(data)
    .select('*')
    .single()

  throwDatabaseError('create watch', error)
  return requireWatch(createdWatch, 'new', 'create watch')
}

/**
 * Updates an accessible non-deleted watch row and returns the saved record.
 */
export async function updateWatch(id: string, data: WatchUpdate): Promise<WatchRow> {
  const client = getClient()
  const { data: updatedWatch, error } = await client
    .from('watches')
    .update(data)
    .eq('id', id)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle()

  throwDatabaseError(`update watch ${id}`, error)
  return requireWatch(updatedWatch, id, 'update watch')
}

/**
 * Soft-deletes an accessible watch row by timestamping `deleted_at`.
 */
export async function softDeleteWatch(id: string): Promise<WatchRow> {
  const client = getClient()
  const { data: deletedWatch, error } = await client
    .from('watches')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle()

  throwDatabaseError(`soft-delete watch ${id}`, error)
  return requireWatch(deletedWatch, id, 'soft-delete watch')
}

/**
 * Searches a user's non-deleted watches with bounded pagination and partial text matching.
 */
export async function searchWatches(userId: string, query: string): Promise<WatchRow[]> {
  const sanitizedQuery = sanitizeSearchTerm(query)
  if (!sanitizedQuery) {
    throw new Error('Search query must contain at least one searchable character.')
  }

  const client = getClient()
  const { data, error } = await client
    .from('watches')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .or(
      [
        `brand.ilike.%${sanitizedQuery}%`,
        `model.ilike.%${sanitizedQuery}%`,
        `reference.ilike.%${sanitizedQuery}%`,
        `serial_number.ilike.%${sanitizedQuery}%`,
        `notes.ilike.%${sanitizedQuery}%`,
      ].join(','),
    )
    .order('updated_at', { ascending: false })
    .range(SEARCH_OFFSET, SEARCH_OFFSET + SEARCH_LIMIT - 1)

  throwDatabaseError(`search watches for user ${userId}`, error)
  return data ?? []
}
