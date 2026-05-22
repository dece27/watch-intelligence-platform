export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD"] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export const DEFAULT_CURRENCY: SupportedCurrency = "USD"

export const normalizeCurrency = (value?: string): SupportedCurrency => {
  if (!value) return DEFAULT_CURRENCY
  const normalized = value.toUpperCase()
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(normalized)
    ? (normalized as SupportedCurrency)
    : DEFAULT_CURRENCY
}

export const formatCurrency = (
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  options?: Intl.NumberFormatOptions
) => {
  const resolvedCurrency = normalizeCurrency(currency)
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: resolvedCurrency,
      maximumFractionDigits: 0,
      ...options,
    }).format(amount)
  } catch {
    return `${resolvedCurrency} ${amount.toLocaleString()}`
  }
}
