interface AppHeaderProps {
  totalValue: number
}

export function AppHeader({ totalValue }: AppHeaderProps) {
  const formattedValue = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(totalValue)

  return (
    <div className="h-16 border-b border-border bg-background/95 backdrop-blur-sm px-6 flex items-center justify-end">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Total Collection Value</span>
        <span className="text-2xl font-semibold tabular-nums text-primary">{formattedValue}</span>
      </div>
    </div>
  )
}
