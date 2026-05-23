export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type WatchCondition = 'Unworn' | 'Mint' | 'Excellent' | 'Very Good' | 'Good' | 'Fair'
export type SubscriptionPlan = 'free' | 'enthusiast' | 'investor' | 'enterprise'
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused'
export type AlertDirection = 'above' | 'below'
export type AppraisalPurpose = 'insurance' | 'estate' | 'collateral' | 'personal'
export type NewsSortMode = 'recent' | 'relevant'
export type ShareAccess = 'read_only'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          bio: string | null
          location: string | null
          is_public: boolean | null
          collector_since: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          location?: string | null
          is_public?: boolean | null
          collector_since?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          location?: string | null
          is_public?: boolean | null
          collector_since?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          plan: SubscriptionPlan
          status: SubscriptionStatus
          current_period_start: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean | null
          trial_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: SubscriptionPlan
          status?: SubscriptionStatus
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean | null
          trial_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: SubscriptionPlan
          status?: SubscriptionStatus
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean | null
          trial_end?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      user_preferences: {
        Row: {
          user_id: string
          currency: string | null
          locale: string | null
          theme: 'dark' | 'light' | null
          show_purchase_prices: boolean | null
          email_price_alerts: boolean | null
          email_weekly_digest: boolean | null
          default_portfolio_view: 'value' | 'roi' | 'brand' | 'timeline' | null
          updated_at: string
        }
        Insert: {
          user_id: string
          currency?: string | null
          locale?: string | null
          theme?: 'dark' | 'light' | null
          show_purchase_prices?: boolean | null
          email_price_alerts?: boolean | null
          email_weekly_digest?: boolean | null
          default_portfolio_view?: 'value' | 'roi' | 'brand' | 'timeline' | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          currency?: string | null
          locale?: string | null
          theme?: 'dark' | 'light' | null
          show_purchase_prices?: boolean | null
          email_price_alerts?: boolean | null
          email_weekly_digest?: boolean | null
          default_portfolio_view?: 'value' | 'roi' | 'brand' | 'timeline' | null
          updated_at?: string
        }
      }
      share_tokens: {
        Row: {
          id: string
          user_id: string
          token: string
          access: ShareAccess
          hide_prices: boolean | null
          view_count: number | null
          last_viewed: string | null
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token?: string
          access?: ShareAccess
          hide_prices?: boolean | null
          view_count?: number | null
          last_viewed?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          token?: string
          access?: ShareAccess
          hide_prices?: boolean | null
          view_count?: number | null
          last_viewed?: string | null
          expires_at?: string | null
          created_at?: string
        }
      }
      watches: {
        Row: {
          id: string
          user_id: string
          brand: string
          model: string | null
          reference: string
          year: number | null
          condition: WatchCondition | null
          has_box: boolean
          has_papers: boolean
          purchase_price: number | null
          purchase_date: string | null
          purchase_currency: string | null
          serial_number: string | null
          notes: string | null
          cover_photo_url: string | null
          is_sold: boolean
          sold_price: number | null
          sold_date: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          brand: string
          model?: string | null
          reference: string
          year?: number | null
          condition?: WatchCondition | null
          has_box?: boolean
          has_papers?: boolean
          purchase_price?: number | null
          purchase_date?: string | null
          purchase_currency?: string | null
          serial_number?: string | null
          notes?: string | null
          cover_photo_url?: string | null
          is_sold?: boolean
          sold_price?: number | null
          sold_date?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          brand?: string
          model?: string | null
          reference?: string
          year?: number | null
          condition?: WatchCondition | null
          has_box?: boolean
          has_papers?: boolean
          purchase_price?: number | null
          purchase_date?: string | null
          purchase_currency?: string | null
          serial_number?: string | null
          notes?: string | null
          cover_photo_url?: string | null
          is_sold?: boolean
          sold_price?: number | null
          sold_date?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      watch_photos: {
        Row: {
          id: string
          watch_id: string
          user_id: string
          storage_path: string
          url: string
          is_cover: boolean | null
          position: number | null
          width: number | null
          height: number | null
          size_bytes: number | null
          created_at: string
        }
        Insert: {
          id?: string
          watch_id: string
          user_id: string
          storage_path: string
          url: string
          is_cover?: boolean | null
          position?: number | null
          width?: number | null
          height?: number | null
          size_bytes?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          watch_id?: string
          user_id?: string
          storage_path?: string
          url?: string
          is_cover?: boolean | null
          position?: number | null
          width?: number | null
          height?: number | null
          size_bytes?: number | null
          created_at?: string
        }
      }
      watch_service_records: {
        Row: {
          id: string
          watch_id: string
          user_id: string
          service_date: string
          service_type: string
          watchmaker: string | null
          location: string | null
          cost: number | null
          currency: string | null
          notes: string | null
          warranty_until: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          watch_id: string
          user_id: string
          service_date: string
          service_type: string
          watchmaker?: string | null
          location?: string | null
          cost?: number | null
          currency?: string | null
          notes?: string | null
          warranty_until?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          watch_id?: string
          user_id?: string
          service_date?: string
          service_type?: string
          watchmaker?: string | null
          location?: string | null
          cost?: number | null
          currency?: string | null
          notes?: string | null
          warranty_until?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      portfolio_snapshots: {
        Row: {
          id: string
          user_id: string
          snapshot_date: string
          total_cost_basis: number
          total_market_value: number
          watch_count: number
          brand_breakdown: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          snapshot_date: string
          total_cost_basis: number
          total_market_value: number
          watch_count: number
          brand_breakdown?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          snapshot_date?: string
          total_cost_basis?: number
          total_market_value?: number
          watch_count?: number
          brand_breakdown?: Json | null
          created_at?: string
        }
      }
      market_price_history: {
        Row: {
          id: string
          brand: string
          reference: string
          price_usd: number
          source: string
          condition: string | null
          recorded_at: string
        }
        Insert: {
          id?: string
          brand: string
          reference: string
          price_usd: number
          source: string
          condition?: string | null
          recorded_at?: string
        }
        Update: {
          id?: string
          brand?: string
          reference?: string
          price_usd?: number
          source?: string
          condition?: string | null
          recorded_at?: string
        }
      }
      market_data_cache: {
        Row: {
          id: string
          cache_key: string
          data: Json
          source: string | null
          computed_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          cache_key: string
          data: Json
          source?: string | null
          computed_at?: string
          expires_at: string
        }
        Update: {
          id?: string
          cache_key?: string
          data?: Json
          source?: string | null
          computed_at?: string
          expires_at?: string
        }
      }
      price_alerts: {
        Row: {
          id: string
          user_id: string
          brand: string
          reference: string
          direction: AlertDirection
          target_price: number
          currency: string | null
          is_active: boolean
          last_checked: string | null
          triggered_at: string | null
          trigger_price: number | null
          notified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          brand: string
          reference: string
          direction: AlertDirection
          target_price: number
          currency?: string | null
          is_active?: boolean
          last_checked?: string | null
          triggered_at?: string | null
          trigger_price?: number | null
          notified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          brand?: string
          reference?: string
          direction?: AlertDirection
          target_price?: number
          currency?: string | null
          is_active?: boolean
          last_checked?: string | null
          triggered_at?: string | null
          trigger_price?: number | null
          notified_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      deal_listings: {
        Row: {
          id: string
          brand: string
          model: string | null
          reference: string
          year: number | null
          condition: WatchCondition | null
          asking_price: number
          fair_value: number
          currency: string | null
          seller_rating: number | null
          days_listed: number | null
          location: string | null
          has_box: boolean | null
          has_papers: boolean | null
          source: string | null
          external_url: string | null
          photo_url: string | null
          deal_score: number | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          brand: string
          model?: string | null
          reference: string
          year?: number | null
          condition?: WatchCondition | null
          asking_price: number
          fair_value: number
          currency?: string | null
          seller_rating?: number | null
          days_listed?: number | null
          location?: string | null
          has_box?: boolean | null
          has_papers?: boolean | null
          source?: string | null
          external_url?: string | null
          photo_url?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand?: string
          model?: string | null
          reference?: string
          year?: number | null
          condition?: WatchCondition | null
          asking_price?: number
          fair_value?: number
          currency?: string | null
          seller_rating?: number | null
          days_listed?: number | null
          location?: string | null
          has_box?: boolean | null
          has_papers?: boolean | null
          source?: string | null
          external_url?: string | null
          photo_url?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
      }
      saved_deals: {
        Row: {
          id: string
          user_id: string
          listing_id: string | null
          listing_snapshot: Json
          saved_at: string
        }
        Insert: {
          id?: string
          user_id: string
          listing_id?: string | null
          listing_snapshot: Json
          saved_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          listing_id?: string | null
          listing_snapshot?: Json
          saved_at?: string
        }
      }
      news_cache: {
        Row: {
          id: string
          cache_key: string
          articles: Json
          article_count: number | null
          cached_at: string
          expires_at: string | null
        }
        Insert: {
          id?: string
          cache_key?: string
          articles: Json
          cached_at?: string
        }
        Update: {
          id?: string
          cache_key?: string
          articles?: Json
          cached_at?: string
        }
      }
      news_relevance_scores: {
        Row: {
          id: string
          article_id: string
          user_id: string
          score: number | null
          reason: string | null
          scored_at: string
        }
        Insert: {
          id?: string
          article_id: string
          user_id: string
          score?: number | null
          reason?: string | null
          scored_at?: string
        }
        Update: {
          id?: string
          article_id?: string
          user_id?: string
          score?: number | null
          reason?: string | null
          scored_at?: string
        }
      }
      news_preferences: {
        Row: {
          user_id: string
          enabled_sources: string[] | null
          muted_sources: string[] | null
          preferred_tags: string[] | null
          sort_mode: NewsSortMode | null
          updated_at: string
        }
        Insert: {
          user_id: string
          enabled_sources?: string[] | null
          muted_sources?: string[] | null
          preferred_tags?: string[] | null
          sort_mode?: NewsSortMode | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          enabled_sources?: string[] | null
          muted_sources?: string[] | null
          preferred_tags?: string[] | null
          sort_mode?: NewsSortMode | null
          updated_at?: string
        }
      }
      news_saved: {
        Row: {
          id: string
          user_id: string
          article_id: string
          article: Json
          saved_at: string
        }
        Insert: {
          id?: string
          user_id: string
          article_id: string
          article: Json
          saved_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          article_id?: string
          article?: Json
          saved_at?: string
        }
      }
      appraisals: {
        Row: {
          id: string
          user_id: string
          watch_ids: string[]
          purpose: AppraisalPurpose
          appraiser_name: string | null
          pdf_url: string | null
          storage_path: string | null
          total_value: number | null
          currency: string | null
          report_data: Json | null
          generated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          watch_ids: string[]
          purpose: AppraisalPurpose
          appraiser_name?: string | null
          pdf_url?: string | null
          storage_path?: string | null
          total_value?: number | null
          currency?: string | null
          report_data?: Json | null
          generated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          watch_ids?: string[]
          purpose?: AppraisalPurpose
          appraiser_name?: string | null
          pdf_url?: string | null
          storage_path?: string | null
          total_value?: number | null
          currency?: string | null
          report_data?: Json | null
          generated_at?: string
        }
      }
      ai_usage_logs: {
        Row: {
          id: string
          user_id: string
          usage_date: string
          call_type: string
          call_count: number
          tokens_used: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          usage_date?: string
          call_type: string
          call_count?: number
          tokens_used?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          usage_date?: string
          call_type?: string
          call_count?: number
          tokens_used?: number | null
          created_at?: string
        }
      }
      feedback: {
        Row: {
          id: string
          user_id: string | null
          message: string
          rating: number | null
          category: 'bug' | 'feature' | 'ux' | 'data' | 'other' | null
          page_context: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          message: string
          rating?: number | null
          category?: 'bug' | 'feature' | 'ux' | 'data' | 'other' | null
          page_context?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          message?: string
          rating?: number | null
          category?: 'bug' | 'feature' | 'ux' | 'data' | 'other' | null
          page_context?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      portfolio_snapshot: {
        Row: {
          user_id: string
          snapshot_date: string
          total_cost_basis: number
          total_market_value: number
          watch_count: number
          brand_breakdown: Json | null
          return_percent: number | null
          created_at: string
        }
      }
      portfolio_brand_allocations: {
        Row: {
          user_id: string
          brand: string
          watch_count: number
          total_value: number
          allocation_percent: number
        }
      }
      latest_market_prices: {
        Row: {
          brand: string
          reference: string
          price_usd: number
          source: string
          condition: string | null
          recorded_at: string
        }
      }
      active_price_alerts: {
        Row: {
          id: string
          user_id: string
          brand: string
          reference: string
          direction: AlertDirection
          target_price: number
          currency: string | null
          is_active: boolean
          last_checked: string | null
          triggered_at: string | null
          trigger_price: number | null
          notified_at: string | null
          created_at: string
          updated_at: string
          current_price_usd: number | null
          market_recorded_at: string | null
        }
      }
    }
    Functions: {
      create_share_token: {
        Args: {
          p_hide_prices?: boolean | null
          p_expires_at?: string | null
        }
        Returns: Database['public']['Tables']['share_tokens']['Row'][]
      }
      get_shared_collection: {
        Args: {
          p_token: string
        }
        Returns: {
          token: string
          user_id: string
          access: ShareAccess
          hide_prices: boolean
          display_name: string | null
          view_count: number
          last_viewed: string | null
          expires_at: string | null
          watches: Json
        }[]
      }
      record_ai_usage: {
        Args: {
          p_call_type: string
          p_tokens?: number | null
          p_usage_date?: string | null
          p_increment?: number | null
        }
        Returns: Database['public']['Tables']['ai_usage_logs']['Row'][]
      }
    }
    Enums: {
      watch_condition: WatchCondition
      subscription_plan: SubscriptionPlan
      subscription_status: SubscriptionStatus
      alert_direction: AlertDirection
      appraisal_purpose: AppraisalPurpose
      news_sort_mode: NewsSortMode
      share_access: ShareAccess
    }
  }
}

type PublicSchema = Database['public']

export type TableName = keyof PublicSchema['Tables']
export type ViewName = keyof PublicSchema['Views']

export type TableRow<T extends TableName> = PublicSchema['Tables'][T]['Row']
export type TableInsert<T extends TableName> = PublicSchema['Tables'][T]['Insert']
export type TableUpdate<T extends TableName> = PublicSchema['Tables'][T]['Update']
export type ViewRow<T extends ViewName> = PublicSchema['Views'][T]['Row']
