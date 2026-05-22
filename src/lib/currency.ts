export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD"] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export const DEFAULT_CURRENCY: SupportedCurrency = "USD"

const USD_EXCHANGE_RATES: Record<SupportedCurrency, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 156.0,
  CHF: 0.91,
  CAD: 1.37,
  AUD: 1.52,
}

export const normalizeCurrency = (value?: string): SupportedCurrency => {
  if (!value) return DEFAULT_CURRENCY
  const normalized = value.toUpperCase()
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(normalized)
    ? (normalized as SupportedCurrency)
    : DEFAULT_CURRENCY
}

export const convertCurrency = (
  amount: number,
  sourceCurrency: string = DEFAULT_CURRENCY,
  targetCurrency: string = DEFAULT_CURRENCY
) => {
  if (!Number.isFinite(amount)) return 0
  const from = normalizeCurrency(sourceCurrency)
  const to = normalizeCurrency(targetCurrency)
  if (from === to) return amount

  const amountInUsd = amount / USD_EXCHANGE_RATES[from]
  return amountInUsd * USD_EXCHANGE_RATES[to]
}

export const formatCurrency = (
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  options?: Intl.NumberFormatOptions & { sourceCurrency?: string }
) => {
  const resolvedCurrency = normalizeCurrency(currency)
  const convertedAmount = convertCurrency(
    amount,
    options?.sourceCurrency || DEFAULT_CURRENCY,
    resolvedCurrency
  )
  const { sourceCurrency: _sourceCurrency, ...intlOptions } = options || {}
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: resolvedCurrency,
      maximumFractionDigits: 0,
      ...intlOptions,
    }).format(convertedAmount)
  } catch {
    return `${resolvedCurrency} ${convertedAmount.toLocaleString()}`
  }
}
