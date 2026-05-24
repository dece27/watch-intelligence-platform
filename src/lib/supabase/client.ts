import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

let browserClient: SupabaseClient<Database> | null = null

function readEnv(name: string): string | undefined {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const processEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }).process?.env

  return viteEnv?.[name] ?? processEnv?.[name]
}

export function hasSupabaseBrowserEnv(): boolean {
  return Boolean(readEnv('SUPABASE_URL')) && Boolean(readEnv('SUPABASE_ANON_KEY'))
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
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_ANON_KEY'),
  )

  return browserClient
}

export const createSupabaseBrowserClient = getSupabaseClient
