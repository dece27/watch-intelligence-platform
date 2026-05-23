import { createClient as createSupabaseClient } from '@supabase/supabase-js'
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

/**
 * Creates a Supabase client with the anon key.
 * Suitable for server-side scripts and Supabase Edge Functions where the
 * caller provides its own auth token.
 */
export function createClient(): SupabaseClient<Database> {
  return createSupabaseClient<Database>(
    requireEnv('VITE_SUPABASE_URL'),
    requireEnv('VITE_SUPABASE_ANON_KEY'),
  )
}

/**
 * Creates a service-role Supabase client that bypasses RLS.
 * For use in trusted server-side contexts only — never expose the service role
 * key to the browser or any client-side bundle.
 */
export function createAdminClient(): SupabaseClient<Database> {
  return createSupabaseClient<Database>(
    requireEnv('VITE_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
