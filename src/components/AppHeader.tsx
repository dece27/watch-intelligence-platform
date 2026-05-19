interface AppHeaderProps {
  totalValue: number
  isMobile?: boolean
}

export function AppHeader({ totalValue, isMobile }: AppHeaderProps) {
  const formattedValue = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(totalValue)

  return (
    <div className="sticky top-0 h-14 md:h-16 border-b border-border bg-background/95 backdrop-blur-sm px-4 md:px-6 flex items-center justify-between md:justify-end z-40">
      {isMobile && (
        <div className="flex items-center gap-2">
          <span className="text-xl text-primary">◈</span>
          <h1 className="text-lg font-semibold">WatchVault</h1>
        </div>
      )}
      <div className="flex items-center gap-2">
        {!isMobile && <span className="text-sm text-muted-foreground">Total Collection Value</span>}
        <span className={isMobile ? "text-lg font-semibold tabular-nums text-primary" : "text-2xl font-semibold tabular-nums text-primary"}>
          {formattedValue}
        </span>
      </div>
    </div>
  )
}
