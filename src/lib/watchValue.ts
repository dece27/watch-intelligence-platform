import type { Watch } from '@/lib/types'

const BRAND_MULTIPLIERS: Record<string, number> = {
  'Rolex': 1.15,
  'Patek Philippe': 1.25,
  'Audemars Piguet': 1.20,
  'IWC': 1.08,
  'Omega': 1.05,
  'Cartier': 1.10,
  'Vacheron Constantin': 1.22,
  'A. Lange & Söhne': 1.18,
}

const MODEL_MULTIPLIERS: Record<string, number> = {
  'Daytona': 1.35,
  'Submariner': 1.20,
  'GMT': 1.18,
  'Nautilus': 1.40,
  'Aquanaut': 1.28,
  'Royal Oak': 1.35,
  'Speedmaster': 1.08,
}

/**
 * Returns the best available market value for a watch.
 * Uses the stored `currentValue` when present; otherwise estimates one
 * from purchase price adjusted for brand, model, year, condition, and
 * accessories — the same heuristic used by PortfolioModule.
 */
export function getEstimatedMarketValue(watch: Watch): number {
  if (watch.currentValue) return watch.currentValue

  let multiplier = BRAND_MULTIPLIERS[watch.brand] || 1.05

  Object.keys(MODEL_MULTIPLIERS).forEach(model => {
    if (watch.model.includes(model)) {
      multiplier = Math.max(multiplier, MODEL_MULTIPLIERS[model])
    }
  })

  const yearFactor = watch.year && watch.year >= 2020 ? 1.02 : 0.98
  const conditionFactor =
    watch.condition === 'mint'
      ? 1.05
      : watch.condition === 'excellent'
        ? 1.0
        : watch.condition === 'good'
          ? 0.95
          : 0.88
  const accessoryFactor =
    watch.hasBox && watch.hasPapers ? 1.05 : watch.hasBox || watch.hasPapers ? 1.02 : 0.97

  return Math.round(watch.purchasePrice * multiplier * yearFactor * conditionFactor * accessoryFactor)
}
