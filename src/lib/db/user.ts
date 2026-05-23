import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, TableInsert, TableRow, TableUpdate } from '@/lib/supabase/types'

export interface ProfileRecord {
  id: string
  displayName?: string
  avatarUrl?: string
  bio?: string
  location?: string
  isPublic: boolean
  collectorSince?: number
  createdAt: string
  updatedAt: string
}

export type ProfileInput = Omit<ProfileRecord, 'createdAt' | 'updatedAt'>

export interface SubscriptionRecord {
  id: string
  userId: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  plan: Database['public']['Enums']['subscription_plan']
  status: Database['public']['Enums']['subscription_status']
  currentPeriodStart?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd: boolean
  trialEnd?: string
  createdAt: string
  updatedAt: string
}

export interface UserPreferencesRecord {
  userId: string
  currency: string
  locale: string
  theme: 'dark' | 'light'
  showPurchasePrices: boolean
  emailPriceAlerts: boolean
  emailWeeklyDigest: boolean
  defaultPortfolioView: 'value' | 'roi' | 'brand' | 'timeline'
  updatedAt: string
}

export interface ShareTokenRecord {
  id: string
  userId: string
  token: string
  access: Database['public']['Enums']['share_access']
  hidePrices: boolean
  viewCount: number
  lastViewed?: string
  expiresAt?: string
  createdAt: string
}

export interface SharedCollectionRecord {
  token: string
  userId: string
  access: Database['public']['Enums']['share_access']
  hidePrices: boolean
  displayName?: string
  viewCount: number
  lastViewed?: string
  expiresAt?: string
  watches: unknown[]
}

function throwIfError(error: PostgrestError | null): asserts error is null {
  if (error) {
    throw error
  }
}

function mapProfile(row: TableRow<'profiles'>): ProfileRecord {
  return {
    id: row.id,
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    bio: row.bio ?? undefined,
    location: row.location ?? undefined,
    isPublic: row.is_public ?? false,
    collectorSince: row.collector_since ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toProfileInsert(profile: ProfileInput): TableInsert<'profiles'> {
  return {
    id: profile.id,
    display_name: profile.displayName ?? null,
    avatar_url: profile.avatarUrl ?? null,
    bio: profile.bio ?? null,
    location: profile.location ?? null,
    is_public: profile.isPublic,
    collector_since: profile.collectorSince ?? null,
  }
}

function toProfileUpdate(profile: Partial<ProfileInput>): TableUpdate<'profiles'> {
  return {
    display_name: profile.displayName ?? null,
    avatar_url: profile.avatarUrl ?? null,
    bio: profile.bio ?? null,
    location: profile.location ?? null,
    is_public: profile.isPublic,
    collector_since: profile.collectorSince ?? null,
  }
}

function mapSubscription(row: TableRow<'subscriptions'>): SubscriptionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id ?? undefined,
    stripeSubscriptionId: row.stripe_subscription_id ?? undefined,
    plan: row.plan,
    status: row.status,
    currentPeriodStart: row.current_period_start ?? undefined,
    currentPeriodEnd: row.current_period_end ?? undefined,
    cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
    trialEnd: row.trial_end ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPreferences(row: TableRow<'user_preferences'>): UserPreferencesRecord {
  return {
    userId: row.user_id,
    currency: row.currency ?? 'USD',
    locale: row.locale ?? 'en',
    theme: row.theme ?? 'dark',
    showPurchasePrices: row.show_purchase_prices ?? true,
    emailPriceAlerts: row.email_price_alerts ?? true,
    emailWeeklyDigest: row.email_weekly_digest ?? false,
    defaultPortfolioView: row.default_portfolio_view ?? 'value',
    updatedAt: row.updated_at,
  }
}

function mapShareToken(row: TableRow<'share_tokens'>): ShareTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    access: row.access,
    hidePrices: row.hide_prices ?? true,
    viewCount: row.view_count ?? 0,
    lastViewed: row.last_viewed ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
  }
}

export async function getUserProfile(client: Pick<SupabaseClient<any>, 'from'>, userId: string): Promise<ProfileRecord | null> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  throwIfError(error)
  return data ? mapProfile(data) : null
}

export async function upsertUserProfile(client: Pick<SupabaseClient<any>, 'from'>, profile: ProfileInput): Promise<ProfileRecord> {
  const { data, error } = await client
    .from('profiles')
    .upsert(toProfileInsert(profile), { onConflict: 'id' })
    .select('*')
    .single()

  throwIfError(error)
  return mapProfile(data)
}

export async function updateUserProfile(
  client: Pick<SupabaseClient<any>, 'from'>,
  userId: string,
  profile: Partial<ProfileInput>,
): Promise<ProfileRecord> {
  const { data, error } = await client
    .from('profiles')
    .update(toProfileUpdate(profile))
    .eq('id', userId)
    .select('*')
    .single()

  throwIfError(error)
  return mapProfile(data)
}

export async function getSubscription(client: Pick<SupabaseClient<any>, 'from'>, userId: string): Promise<SubscriptionRecord | null> {
  const { data, error } = await client
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  throwIfError(error)
  return data ? mapSubscription(data) : null
}

export async function getUserPreferences(
  client: Pick<SupabaseClient<any>, 'from'>,
  userId: string,
): Promise<UserPreferencesRecord | null> {
  const { data, error } = await client
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  throwIfError(error)
  return data ? mapPreferences(data) : null
}

export async function upsertUserPreferences(
  client: Pick<SupabaseClient<any>, 'from'>,
  preferences: Omit<UserPreferencesRecord, 'updatedAt'>,
): Promise<UserPreferencesRecord> {
  const { data, error } = await client
    .from('user_preferences')
    .upsert(
      {
        user_id: preferences.userId,
        currency: preferences.currency,
        locale: preferences.locale,
        theme: preferences.theme,
        show_purchase_prices: preferences.showPurchasePrices,
        email_price_alerts: preferences.emailPriceAlerts,
        email_weekly_digest: preferences.emailWeeklyDigest,
        default_portfolio_view: preferences.defaultPortfolioView,
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single()

  throwIfError(error)
  return mapPreferences(data)
}

export async function createShareToken(
  client: Pick<SupabaseClient<any>, 'rpc'>,
  options?: { hidePrices?: boolean; expiresAt?: string },
): Promise<ShareTokenRecord> {
  const { data, error } = await client.rpc('create_share_token', {
    p_hide_prices: options?.hidePrices ?? true,
    p_expires_at: options?.expiresAt ?? null,
  })

  throwIfError(error)
  const share = (data ?? [])[0]
  if (!share) {
    throw new Error('Failed to create share token')
  }

  return mapShareToken(share)
}

export async function getSharedCollection(
  client: Pick<SupabaseClient<any>, 'rpc'>,
  token: string,
): Promise<SharedCollectionRecord | null> {
  const { data, error } = await client.rpc('get_shared_collection', { p_token: token })
  throwIfError(error)

  const share = (data ?? [])[0]
  if (!share) {
    return null
  }

  return {
    token: share.token,
    userId: share.user_id,
    access: share.access,
    hidePrices: share.hide_prices,
    displayName: share.display_name ?? undefined,
    viewCount: share.view_count,
    lastViewed: share.last_viewed ?? undefined,
    expiresAt: share.expires_at ?? undefined,
    watches: (share.watches as unknown[]) ?? [],
  }
}
