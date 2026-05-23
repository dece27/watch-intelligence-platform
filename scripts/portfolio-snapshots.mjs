import { createClient } from '@supabase/supabase-js'

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function createServiceClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function getMockMarketValue(watch) {
  const purchasePrice = Number(watch.purchase_price || 0)
  if (purchasePrice <= 0) return 0

  const brandMultipliers = {
    Rolex: 1.15,
    'Patek Philippe': 1.25,
    'Audemars Piguet': 1.2,
    IWC: 1.08,
    Omega: 1.05,
    Cartier: 1.1,
    'Vacheron Constantin': 1.22,
    'A. Lange & Söhne': 1.18,
  }

  const refMultipliers = {
    Daytona: 1.35,
    Submariner: 1.2,
    GMT: 1.18,
    Nautilus: 1.4,
    Aquanaut: 1.28,
    'Royal Oak': 1.35,
    Speedmaster: 1.08,
  }

  let multiplier = brandMultipliers[watch.brand] || 1.05
  const modelText = `${watch.model || ''} ${watch.reference || ''}`
  for (const [referenceHint, referenceMultiplier] of Object.entries(refMultipliers)) {
    if (modelText.includes(referenceHint)) {
      multiplier = Math.max(multiplier, referenceMultiplier)
    }
  }

  const yearFactor = watch.year && watch.year >= 2020 ? 1.02 : 0.98
  const conditionFactor =
    watch.condition === 'Mint' ? 1.05 :
    watch.condition === 'Excellent' ? 1 :
    watch.condition === 'Good' ? 0.95 :
    0.88
  const accessoryFactor = watch.has_box && watch.has_papers ? 1.05 : watch.has_box || watch.has_papers ? 1.02 : 0.97

  return Math.round(purchasePrice * multiplier * yearFactor * conditionFactor * accessoryFactor)
}

async function main() {
  const supabase = createServiceClient()
  const { data: watches, error } = await supabase
    .from('watches')
    .select('user_id, brand, model, reference, year, condition, has_box, has_papers, purchase_price')
    .is('deleted_at', null)
    .eq('is_sold', false)

  if (error) {
    throw error
  }

  const watchesByUser = new Map()
  for (const watch of watches || []) {
    const current = watchesByUser.get(watch.user_id) || []
    current.push(watch)
    watchesByUser.set(watch.user_id, current)
  }

  const results = await Promise.allSettled(
    Array.from(watchesByUser.entries()).map(async ([userId, userWatches]) => {
      const totalCostBasis = userWatches.reduce((sum, watch) => sum + Number(watch.purchase_price || 0), 0)
      const brandBreakdown = userWatches.reduce((accumulator, watch) => {
        const estimatedValue = getMockMarketValue(watch)
        const brandSummary = accumulator[watch.brand] || {
          watchCount: 0,
          totalCostBasis: 0,
          totalMarketValue: 0,
        }

        brandSummary.watchCount += 1
        brandSummary.totalCostBasis += Number(watch.purchase_price || 0)
        brandSummary.totalMarketValue += estimatedValue
        accumulator[watch.brand] = brandSummary
        return accumulator
      }, {})

      const totalMarketValue = Object.values(brandBreakdown).reduce((sum, brand) => sum + brand.totalMarketValue, 0)

      const { error: snapshotError } = await supabase.rpc('upsert_portfolio_snapshot', {
        p_user_id: userId,
        p_total_cost: Number(totalCostBasis.toFixed(2)),
        p_total_value: Number(totalMarketValue.toFixed(2)),
        p_watch_count: userWatches.length,
        p_brand_breakdown: brandBreakdown,
      })

      if (snapshotError) {
        throw snapshotError
      }
    }),
  )

  const successCount = results.filter((result) => result.status === 'fulfilled').length
  results
    .filter((result) => result.status === 'rejected')
    .forEach((result) => console.error(result.reason instanceof Error ? result.reason.message : String(result.reason)))

  console.log(`Snapshotted portfolio for ${successCount} users`)
}

await main()
