/**
 * ensure-admin-auth
 *
 * Supabase Edge Function called during administrator login.
 * Uses the service-role key to create or reconcile the administrator's
 * Supabase Auth account so that subsequent signInWithPassword calls
 * succeed and RLS-guarded writes (watches, preferences, …) go to the
 * database rather than falling back to KV storage.
 *
 * The function is intentionally scoped to a single hard-coded email
 * address and performs no sensitive operations beyond confirming that
 * one account.  The service-role key is never exposed to the browser.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { reconcileAdminAuthAccount } from './reconcileAdminAuth.ts'

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

    await reconcileAdminAuthAccount(adminClient, ADMIN_AUTH_EMAIL, password)

    return json(200, { success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return json(500, { error: message })
  }
})
