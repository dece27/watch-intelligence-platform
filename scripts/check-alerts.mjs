import { createClient } from '@supabase/supabase-js'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const DEFAULT_RESEND_FROM = 'onboarding@resend.dev'

function getOptionalEnv(name) {
  return process.env[name]?.trim() || null
}

function createServiceClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function shouldTrigger(alert, latestPrice) {
  if (latestPrice == null) return false
  if (alert.direction === 'above') {
    return latestPrice >= Number(alert.target_price)
  }
  return latestPrice <= Number(alert.target_price)
}

function canNotifyAgain(notifiedAt) {
  if (!notifiedAt) return true
  const notifiedTimestamp = Date.parse(notifiedAt)
  if (Number.isNaN(notifiedTimestamp)) return true
  return Date.now() - notifiedTimestamp >= TWENTY_FOUR_HOURS_MS
}

async function sendResendEmail({ apiKey, to, subject, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM,
      to: [to],
      subject,
      html,
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend returned HTTP ${response.status}: ${await response.text()}`)
  }
}

async function main() {
  const resendApiKey = getOptionalEnv('RESEND_API_KEY')
  if (!resendApiKey) {
    console.log('Skipping: RESEND_API_KEY is not configured')
    return
  }

  const supabaseUrl = getOptionalEnv('SUPABASE_URL')
  const supabaseServiceRoleKey = getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.log('Skipping: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured')
    return
  }
  const supabase = createServiceClient()

  const { data: alerts, error } = await supabase
    .from('price_alerts')
    .select('id, user_id, brand, reference, direction, target_price, currency, notified_at')
    .eq('is_active', true)

  if (error) {
    throw error
  }

  const profileIds = [...new Set((alerts || []).map((alert) => alert.user_id))]
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', profileIds)

  if (profileError) {
    throw profileError
  }

  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))
  const userEmailCache = new Map()

  const results = await Promise.allSettled(
    (alerts || []).map(async (alert) => {
      const { data: latestMarketPrice, error: marketError } = await supabase
        .from('market_price_history')
        .select('price_usd, recorded_at')
        .eq('brand', alert.brand)
        .eq('reference', alert.reference)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (marketError) {
        throw marketError
      }

      const now = new Date().toISOString()
      const latestPriceUsd = latestMarketPrice ? Number(latestMarketPrice.price_usd) : null
      const crossed = shouldTrigger(alert, latestPriceUsd)

      if (!crossed || !canNotifyAgain(alert.notified_at)) {
        const { error: updateError } = await supabase
          .from('price_alerts')
          .update({ last_checked: now })
          .eq('id', alert.id)

        if (updateError) {
          throw updateError
        }

        return false
      }

      let userEmail = userEmailCache.get(alert.user_id)
      if (!userEmail) {
        const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(alert.user_id)
        if (userError) {
          throw userError
        }
        userEmail = userResult.user?.email || null
        userEmailCache.set(alert.user_id, userEmail)
      }

      if (!userEmail) {
        throw new Error(`No email found for user ${alert.user_id}`)
      }

      const profile = profilesById.get(alert.user_id)
      const displayName = profile?.display_name || 'Collector'
      const currentPriceText = latestPriceUsd == null ? 'N/A' : `$${latestPriceUsd.toLocaleString('en-US')}`
      const thresholdText = `$${Number(alert.target_price).toLocaleString('en-US')}`

      await sendResendEmail({
        apiKey: resendApiKey,
        to: userEmail,
        subject: `Your ${alert.brand} ${alert.reference} price alert triggered`,
        html: `<p>Hi ${displayName},</p><p>Your price alert for <strong>${alert.brand} ${alert.reference}</strong> has triggered.</p><p><strong>Current price:</strong> ${currentPriceText}<br /><strong>Alert threshold:</strong> ${thresholdText}</p><p>Log in to WatchVault to review the latest market conditions.</p>`,
      })

      const { error: updateError } = await supabase
        .from('price_alerts')
        .update({
          last_checked: now,
          triggered_at: now,
          notified_at: now,
          trigger_price: latestPriceUsd,
        })
        .eq('id', alert.id)

      if (updateError) {
        throw updateError
      }

      return true
    }),
  )

  let triggeredCount = 0
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      if (result.value) {
        triggeredCount += 1
      }
      return
    }

    console.error(result.reason instanceof Error ? result.reason.message : String(result.reason))
  })

  console.log(`Checked ${(alerts || []).length} alerts, triggered ${triggeredCount} notifications`)
}

await main()
