import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

let browserClient: SupabaseClient<Database> | null = null
const SUPABASE_URL_ENV_NAMES = ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'] as const
const SUPABASE_ANON_KEY_ENV_NAMES = ['VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'] as const

function readEnv(name: string): string | undefined {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const processEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }).process?.env

  return viteEnv?.[name] ?? processEnv?.[name]
}

export function hasSupabaseBrowserEnv(): boolean {
  return SUPABASE_URL_ENV_NAMES.some((name) => Boolean(readEnv(name)))
    && SUPABASE_ANON_KEY_ENV_NAMES.some((name) => Boolean(readEnv(name)))
}

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = readEnv(name)
    if (value) {
      return value
    }
  }

  throw new Error(`Missing Supabase environment variable. Checked: ${names.join(', ')}`)
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) {
    return browserClient
  }

  browserClient = createBrowserClient<Database>(
    requireEnv(...SUPABASE_URL_ENV_NAMES),
    requireEnv(...SUPABASE_ANON_KEY_ENV_NAMES),
  )

  return browserClient
}

export const createSupabaseBrowserClient = getSupabaseClient
