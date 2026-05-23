import { createServerClient } from '@supabase/ssr'
import type { CookieOptions, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export interface SupabaseCookieAdapter {
  getAll(): Array<{ name: string; value: string }>
  setAll(cookies: Array<{ name: string; value: string; options?: CookieOptions }>): void
}

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

export function createSupabaseServerClient(cookies: SupabaseCookieAdapter): SupabaseClient<Database> {
  return createServerClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies,
    },
  )
}
