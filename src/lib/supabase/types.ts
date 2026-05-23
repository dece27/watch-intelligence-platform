export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type WatchCondition = 'mint' | 'excellent' | 'good' | 'fair'
export type WatchCategory = 'dress' | 'sport' | 'dive' | 'pilot' | 'chronograph' | 'complications'
export type AlertCondition = 'above' | 'below'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          name: string
          vault_name: string
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          name: string
          vault_name?: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          vault_name?: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      user_preferences: {
        Row: {
          user_id: string
          currency: string
          deals: Json
          updated_at: string
        }
        Insert: {
          user_id: string
          currency?: string
          deals?: Json
          updated_at?: string
        }
        Update: {
          user_id?: string
          currency?: string
          deals?: Json
          updated_at?: string
        }
      }
      watches: {
        Row: {
          id: string
          user_id: string
          brand: string
          model: string
          reference_number: string | null
          serial_number: string | null
          year: number | null
          purchase_price: number
          purchase_date: string
          current_value: number | null
          condition: WatchCondition
          category: WatchCategory
          image_path: string | null
          movement: string | null
          case_material: string | null
          case_diameter: string | null
          notes: string | null
          has_box: boolean
          has_papers: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          brand: string
          model: string
          reference_number?: string | null
          serial_number?: string | null
          year?: number | null
          purchase_price: number
          purchase_date: string
          current_value?: number | null
          condition: WatchCondition
          category: WatchCategory
          image_path?: string | null
          movement?: string | null
          case_material?: string | null
          case_diameter?: string | null
          notes?: string | null
          has_box?: boolean
          has_papers?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          brand?: string
          model?: string
          reference_number?: string | null
          serial_number?: string | null
          year?: number | null
          purchase_price?: number
          purchase_date?: string
          current_value?: number | null
          condition?: WatchCondition
          category?: WatchCategory
          image_path?: string | null
          movement?: string | null
          case_material?: string | null
          case_diameter?: string | null
          notes?: string | null
          has_box?: boolean
          has_papers?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      collection_shares: {
        Row: {
          slug: string
          owner_user_id: string
          owner_vault_name: string
          watches_snapshot: Json
          is_active: boolean
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          slug: string
          owner_user_id: string
          owner_vault_name: string
          watches_snapshot?: Json
          is_active?: boolean
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          slug?: string
          owner_user_id?: string
          owner_vault_name?: string
          watches_snapshot?: Json
          is_active?: boolean
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      price_alerts: {
        Row: {
          id: string
          user_id: string
          watch_id: string | null
          watch_ref: string
          brand: string
          model: string
          condition: AlertCondition
          target_price: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          watch_id?: string | null
          watch_ref: string
          brand: string
          model: string
          condition: AlertCondition
          target_price: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          watch_id?: string | null
          watch_ref?: string
          brand?: string
          model?: string
          condition?: AlertCondition
          target_price?: number
          created_at?: string
          updated_at?: string
        }
      }
      market_brand_snapshots: {
        Row: {
          id: number
          brand: string
          snapshot_date: string
          current_index: number
          sentiment_score: number
          price_change_percent: number | null
          source: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: number
          brand: string
          snapshot_date: string
          current_index: number
          sentiment_score: number
          price_change_percent?: number | null
          source?: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: number
          brand?: string
          snapshot_date?: string
          current_index?: number
          sentiment_score?: number
          price_change_percent?: number | null
          source?: string
          metadata?: Json
          created_at?: string
        }
      }
      auction_results: {
        Row: {
          id: string
          brand: string
          model: string
          reference_number: string | null
          sale_date: string
          sale_price: number
          currency: string
          auction_house: string
          location: string | null
          lot_number: string | null
          result_url: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          brand: string
          model: string
          reference_number?: string | null
          sale_date: string
          sale_price: number
          currency?: string
          auction_house: string
          location?: string | null
          lot_number?: string | null
          result_url?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          brand?: string
          model?: string
          reference_number?: string | null
          sale_date?: string
          sale_price?: number
          currency?: string
          auction_house?: string
          location?: string | null
          lot_number?: string | null
          result_url?: string | null
          metadata?: Json
          created_at?: string
        }
      }
      deal_matches: {
        Row: {
          id: string
          user_id: string
          external_id: string
          brand: string
          model: string
          reference_number: string | null
          price: number
          currency: string
          market_value: number | null
          fair_value: number | null
          discount: number
          condition: string
          seller: string
          location: string
          source: string
          source_url: string | null
          listed_at: string | null
          ai_reasoning: string | null
          image_url: string | null
          match_score: number
          deal_score: number | null
          days_listed: number | null
          seller_rating: number | null
          has_box: boolean
          has_papers: boolean
          year: number | null
          payload: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          external_id: string
          brand: string
          model: string
          reference_number?: string | null
          price: number
          currency?: string
          market_value?: number | null
          fair_value?: number | null
          discount?: number
          condition: string
          seller: string
          location: string
          source?: string
          source_url?: string | null
          listed_at?: string | null
          ai_reasoning?: string | null
          image_url?: string | null
          match_score?: number
          deal_score?: number | null
          days_listed?: number | null
          seller_rating?: number | null
          has_box?: boolean
          has_papers?: boolean
          year?: number | null
          payload?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          external_id?: string
          brand?: string
          model?: string
          reference_number?: string | null
          price?: number
          currency?: string
          market_value?: number | null
          fair_value?: number | null
          discount?: number
          condition?: string
          seller?: string
          location?: string
          source?: string
          source_url?: string | null
          listed_at?: string | null
          ai_reasoning?: string | null
          image_url?: string | null
          match_score?: number
          deal_score?: number | null
          days_listed?: number | null
          seller_rating?: number | null
          has_box?: boolean
          has_papers?: boolean
          year?: number | null
          payload?: Json
          created_at?: string
          updated_at?: string
        }
      }
      news_articles: {
        Row: {
          id: string
          title: string
          summary: string
          url: string
          image_url: string | null
          source: string
          source_icon: string
          published_at: string
          brands: string[]
          tags: string[]
          canonical_score: number
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          summary: string
          url: string
          image_url?: string | null
          source: string
          source_icon: string
          published_at: string
          brands?: string[]
          tags?: string[]
          canonical_score?: number
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          summary?: string
          url?: string
          image_url?: string | null
          source?: string
          source_icon?: string
          published_at?: string
          brands?: string[]
          tags?: string[]
          canonical_score?: number
          created_at?: string
        }
      }
      user_news_feed_cache: {
        Row: {
          user_id: string
          articles: Json
          dependency_hash: string
          cached_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          articles?: Json
          dependency_hash: string
          cached_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          articles?: Json
          dependency_hash?: string
          cached_at?: string
          updated_at?: string
        }
      }
      appraisals: {
        Row: {
          id: string
          user_id: string
          watch_id: string
          appraised_value: number
          replacement_value: number | null
          currency: string
          appraisal_text: string | null
          appraisal_payload: Json
          generated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          watch_id: string
          appraised_value: number
          replacement_value?: number | null
          currency?: string
          appraisal_text?: string | null
          appraisal_payload?: Json
          generated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          watch_id?: string
          appraised_value?: number
          replacement_value?: number | null
          currency?: string
          appraisal_text?: string | null
          appraisal_payload?: Json
          generated_at?: string
          created_at?: string
        }
      }
      ai_usage: {
        Row: {
          user_id: string
          ai_tokens_used: number
          ai_requests_count: number
          last_used_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          ai_tokens_used?: number
          ai_requests_count?: number
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          ai_tokens_used?: number
          ai_requests_count?: number
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      portfolio_snapshot: {
        Row: {
          user_id: string
          watch_count: number
          total_cost: number
          total_estimated_value: number
          average_return_percent: number
          last_updated_at: string | null
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
      latest_market_brand_snapshots: {
        Row: {
          brand: string
          snapshot_date: string
          current_index: number
          sentiment_score: number
          price_change_percent: number | null
          source: string
          metadata: Json
          created_at: string
        }
      }
      active_price_alerts: {
        Row: {
          id: string
          user_id: string
          watch_id: string | null
          watch_ref: string
          brand: string
          model: string
          condition: AlertCondition
          target_price: number
          created_at: string
          updated_at: string
          current_value: number | null
          purchase_price: number | null
        }
      }
    }
    Functions: {
      save_collection_share: {
        Args: {
          p_slug: string
          p_watches_snapshot: Json
          p_expires_at?: string | null
        }
        Returns: Database['public']['Tables']['collection_shares']['Row'][]
      }
      get_shared_collection: {
        Args: {
          p_slug: string
        }
        Returns: {
          slug: string
          owner_user_id: string
          owner_vault_name: string
          watches_snapshot: Json
          created_at: string
          updated_at: string
          expires_at: string | null
        }[]
      }
      record_ai_usage: {
        Args: {
          p_tokens: number
          p_requests?: number
        }
        Returns: Database['public']['Tables']['ai_usage']['Row'][]
      }
    }
    Enums: {
      watch_condition: WatchCondition
      watch_category: WatchCategory
      alert_condition: AlertCondition
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
