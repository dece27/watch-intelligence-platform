import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

function readEnv(name: string): string | undefined {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const processEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }).process?.env

  return viteEnv?.[name] ?? processEnv?.[name]
}

function requireEnv(name: string): string {
  const value = readEnv(name)
  if (!value) {
    throw new Error(`Missing Supabase environment variable: ${name}`)
  }
  return value
}

export function createSupabaseAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
