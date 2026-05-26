import type { Database as GeneratedDatabase } from './types.generated'

export type {
  AlertDirection,
  AppraisalPurpose,
  Json,
  NewsSortMode,
  ShareAccess,
  SubscriptionPlan,
  SubscriptionStatus,
  WatchCondition,
} from './types.generated'

type Relationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne: boolean
  referencedRelation: string
  referencedColumns: string[]
}

type RelationshipOverrides = {
  profiles: [
    {
      foreignKeyName: 'profiles_id_fkey'
      columns: ['id']
      isOneToOne: true
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  subscriptions: [
    {
      foreignKeyName: 'subscriptions_user_id_fkey'
      columns: ['user_id']
      isOneToOne: true
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  user_preferences: [
    {
      foreignKeyName: 'user_preferences_user_id_fkey'
      columns: ['user_id']
      isOneToOne: true
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  share_tokens: [
    {
      foreignKeyName: 'share_tokens_user_id_fkey'
      columns: ['user_id']
      isOneToOne: false
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  watches: [
    {
      foreignKeyName: 'watches_user_id_fkey'
      columns: ['user_id']
      isOneToOne: false
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  watch_photos: [
    {
      foreignKeyName: 'watch_photos_watch_id_fkey'
      columns: ['watch_id']
      isOneToOne: false
      referencedRelation: 'watches'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'watch_photos_user_id_fkey'
      columns: ['user_id']
      isOneToOne: false
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  watch_service_records: [
    {
      foreignKeyName: 'watch_service_records_watch_id_fkey'
      columns: ['watch_id']
      isOneToOne: false
      referencedRelation: 'watches'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'watch_service_records_user_id_fkey'
      columns: ['user_id']
      isOneToOne: false
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  portfolio_snapshots: [
    {
      foreignKeyName: 'portfolio_snapshots_user_id_fkey'
      columns: ['user_id']
      isOneToOne: false
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  price_alerts: [
    {
      foreignKeyName: 'price_alerts_user_id_fkey'
      columns: ['user_id']
      isOneToOne: false
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  saved_deals: [
    {
      foreignKeyName: 'saved_deals_user_id_fkey'
      columns: ['user_id']
      isOneToOne: false
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'saved_deals_listing_id_fkey'
      columns: ['listing_id']
      isOneToOne: false
      referencedRelation: 'deal_listings'
      referencedColumns: ['id']
    },
  ]
  news_relevance_scores: [
    {
      foreignKeyName: 'news_relevance_scores_user_id_fkey'
      columns: ['user_id']
      isOneToOne: false
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  news_preferences: [
    {
      foreignKeyName: 'news_preferences_user_id_fkey'
      columns: ['user_id']
      isOneToOne: true
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  news_saved: [
    {
      foreignKeyName: 'news_saved_user_id_fkey'
      columns: ['user_id']
      isOneToOne: false
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  appraisals: [
    {
      foreignKeyName: 'appraisals_user_id_fkey'
      columns: ['user_id']
      isOneToOne: false
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  ai_usage_logs: [
    {
      foreignKeyName: 'ai_usage_logs_user_id_fkey'
      columns: ['user_id']
      isOneToOne: false
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
  feedback: [
    {
      foreignKeyName: 'feedback_user_id_fkey'
      columns: ['user_id']
      isOneToOne: false
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
  ]
}

type AddRelationships<T extends GeneratedDatabase> = {
  public: {
    Tables: {
      [TableName in keyof T['public']['Tables']]: T['public']['Tables'][TableName] &
        (TableName extends keyof RelationshipOverrides
          ? { Relationships: RelationshipOverrides[TableName] }
          : { Relationships: [] })
    }
    Views: {
      [Name in keyof T['public']['Views']]: T['public']['Views'][Name] &
        (T['public']['Views'][Name] extends { Relationships: infer Existing extends readonly Relationship[] }
          ? { Relationships: Existing }
          : { Relationships: [] })
    }
    Functions: T['public']['Functions']
    Enums: T['public']['Enums']
  }
}

export type Database = AddRelationships<GeneratedDatabase>

type PublicSchema = Database['public']

export type TableName = keyof PublicSchema['Tables']
export type ViewName = keyof PublicSchema['Views']

export type TableRow<T extends TableName> = PublicSchema['Tables'][T]['Row']
export type TableInsert<T extends TableName> = PublicSchema['Tables'][T]['Insert']
export type TableUpdate<T extends TableName> = PublicSchema['Tables'][T]['Update']
export type ViewRow<T extends ViewName> = PublicSchema['Views'][T]['Row']
