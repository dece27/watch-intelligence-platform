/**
 * ensure-admin-auth
 *
 * Supabase Edge Function called during administrator login.
 * Uses the service-role key to create or confirm the administrator's
 * Supabase Auth account so that subsequent signInWithPassword calls
 * succeed and RLS-guarded writes (watches, preferences, …) go to the
 * database rather than falling back to KV storage.
 *
 * The function is intentionally scoped to a single hard-coded email
 * address and performs no sensitive operations beyond confirming that
 * one account.  The service-role key is never exposed to the browser.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/** Canonical Supabase Auth email for the administrator account. */
const ADMIN_AUTH_EMAIL = 'administrator@watchvault.local'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: 'Server misconfigured: missing Supabase credentials' })
  }

  let password: string
  try {
    const body = await req.json()
    password = typeof body?.password === 'string' ? body.password : ''
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  if (!password) {
    return json(400, { error: 'password is required' })
  }

  try {
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Look up the admin user by email.
    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers()
    if (listError) {
      return json(500, { error: `Failed to list users: ${listError.message}` })
    }

    const adminUser = listData.users.find((u) => u.email === ADMIN_AUTH_EMAIL)

    if (!adminUser) {
      // First-time setup: create the admin account with email pre-confirmed.
      const { error: createError } = await adminClient.auth.admin.createUser({
        email: ADMIN_AUTH_EMAIL,
        password,
        email_confirm: true,
        user_metadata: { name: 'Administrator', vault_name: 'WatchVault' },
      })
      if (createError) {
        return json(500, { error: `Failed to create admin user: ${createError.message}` })
      }
    } else if (!adminUser.email_confirmed_at) {
      // Account exists but email was never confirmed — confirm it.
      // The password is intentionally not overwritten here: the account
      // was created with the correct password already, and accepting an
      // arbitrary password from the caller could allow unintended
      // credential changes via direct API calls.
      const { error: updateError } = await adminClient.auth.admin.updateUserById(adminUser.id, {
        email_confirm: true,
      })
      if (updateError) {
        return json(500, { error: `Failed to confirm admin user: ${updateError.message}` })
      }
    }
    // If the account already exists and is confirmed, nothing to do.

    return json(200, { success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return json(500, { error: message })
  }
})
