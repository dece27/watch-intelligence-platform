import { createServerClient } from '@supabase/ssr'
import type { CookieOptions, SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/supabase/types'

type NextCookieStore = {
  getAll(): Array<{ name: string; value: string }>
  set(name: string, value: string, options?: CookieOptions): void
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

function getCookieStore(): NextCookieStore {
  return cookies() as unknown as NextCookieStore
}

/**
 * Creates a per-request Supabase server client backed by the active Next.js cookie store.
 */
export function createClient(): SupabaseClient<Database> {
  const cookieStore = getCookieStore()

  return createServerClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookieValues) => {
          cookieValues.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    },
  )
}

/**
 * Creates a service-role Supabase server client without request cookie persistence.
 */
export function createAdminClient(): SupabaseClient<Database> {
  return createServerClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      cookies: {
        getAll: () => [],
        setAll: () => undefined,
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
