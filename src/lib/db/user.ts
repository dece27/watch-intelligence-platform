import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { SharedCollectionRecord, SharedWatch, User, UserPreferences } from '@/lib/types'
import type { Database, Json, TableInsert, TableRow, TableUpdate } from '@/lib/supabase/types'

export interface UserProfileInput extends Omit<User, 'createdAt'> {
  createdAt?: string
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapProfile(row: TableRow<'profiles'>): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    vaultName: row.vault_name,
    avatarUrl: row.avatar_url ?? undefined,
    createdAt: row.created_at,
  }
}

function toProfileInsert(profile: UserProfileInput): TableInsert<'profiles'> {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    vault_name: profile.vaultName,
    avatar_url: profile.avatarUrl ?? null,
    created_at: profile.createdAt,
  }
}

function toProfileUpdate(profile: Partial<UserProfileInput>): TableUpdate<'profiles'> {
  return {
    email: profile.email,
    name: profile.name,
    vault_name: profile.vaultName,
    avatar_url: profile.avatarUrl ?? null,
  }
}

function mapPreferences(row: TableRow<'user_preferences'>): UserPreferences {
  return {
    userId: row.user_id,
    currency: row.currency,
    deals: (row.deals as UserPreferences['deals']) ?? undefined,
    updatedAt: row.updated_at,
  }
}

export async function getUserProfile(client: Pick<SupabaseClient<Database>, 'from'>, userId: string): Promise<User | null> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  throwIfError(error)
  return data ? mapProfile(data) : null
}

export async function upsertUserProfile(client: Pick<SupabaseClient<Database>, 'from'>, profile: UserProfileInput): Promise<User> {
  const { data, error } = await client
    .from('profiles')
    .upsert(toProfileInsert(profile), { onConflict: 'id' })
    .select('*')
    .single()

  throwIfError(error)
  return mapProfile(data)
}

export async function updateUserProfile(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  profile: Partial<UserProfileInput>,
): Promise<User> {
  const { data, error } = await client
    .from('profiles')
    .update(toProfileUpdate(profile))
    .eq('id', userId)
    .select('*')
    .single()

  throwIfError(error)
  return mapProfile(data)
}

export async function getUserPreferences(
  client: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
): Promise<UserPreferences | null> {
  const { data, error } = await client
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  throwIfError(error)
  return data ? mapPreferences(data) : null
}

export async function upsertUserPreferences(
  client: Pick<SupabaseClient<Database>, 'from'>,
  preferences: UserPreferences,
): Promise<UserPreferences> {
  const { data, error } = await client
    .from('user_preferences')
    .upsert(
      {
        user_id: preferences.userId,
        currency: preferences.currency,
        deals: (preferences.deals ?? {}) as Json,
        updated_at: preferences.updatedAt,
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single()

  throwIfError(error)
  return mapPreferences(data)
}

export async function saveSharedCollection(
  client: Pick<SupabaseClient<Database>, 'rpc'>,
  slug: string,
  watches: SharedWatch[],
  expiresAt?: string,
): Promise<SharedCollectionRecord> {
  const { data, error } = await client.rpc('save_collection_share', {
    p_slug: slug,
    p_watches_snapshot: watches,
    p_expires_at: expiresAt ?? null,
  })

  throwIfError(error)
  const share = (data ?? [])[0]
  if (!share) {
    throw new Error('Failed to persist shared collection')
  }

  return {
    slug: share.slug,
    ownerUserId: share.owner_user_id,
    ownerVaultName: share.owner_vault_name,
    watches: (share.watches_snapshot as SharedWatch[]) ?? [],
    createdAt: share.created_at,
    updatedAt: share.updated_at,
  }
}

export async function getSharedCollection(
  client: Pick<SupabaseClient<Database>, 'rpc'>,
  slug: string,
): Promise<SharedCollectionRecord | null> {
  const { data, error } = await client.rpc('get_shared_collection', { p_slug: slug })
  throwIfError(error)

  const share = (data ?? [])[0]
  if (!share) {
    return null
  }

  return {
    slug: share.slug,
    ownerUserId: share.owner_user_id,
    ownerVaultName: share.owner_vault_name,
    watches: (share.watches_snapshot as SharedWatch[]) ?? [],
    createdAt: share.created_at,
    updatedAt: share.updated_at,
  }
}
