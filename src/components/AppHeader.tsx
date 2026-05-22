import { User } from "@/lib/types"
import { UserProfile } from "@/components/UserProfile"
import { formatCurrency } from "@/lib/currency"

interface AppHeaderProps {
  totalValue: number
  isMobile?: boolean
  user: User
  onLogout: () => void
  preferredCurrency: string
  onCurrencyChange: (currency: string) => void
}

export function AppHeader({ totalValue, isMobile, user, onLogout, preferredCurrency, onCurrencyChange }: AppHeaderProps) {
  const formattedValue = formatCurrency(totalValue, preferredCurrency, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

  return (
    <div className="sticky top-0 h-14 md:h-16 border-b border-border bg-background/95 backdrop-blur-sm px-4 md:px-6 flex items-center justify-between z-40">
      {isMobile && (
        <div className="flex items-center gap-2">
          <span className="text-xl text-primary">◈</span>
          <h1 className="text-lg font-semibold">WatchVault</h1>
        </div>
      )}
      <div className="flex items-center gap-4 ml-auto">
        <div className="flex items-center gap-2">
          {!isMobile && <span className="text-sm text-muted-foreground">Total Collection Value</span>}
          <span className={isMobile ? "text-lg font-semibold tabular-nums text-primary" : "text-2xl font-semibold tabular-nums text-primary"}>
            {formattedValue}
          </span>
        </div>
        <UserProfile
          user={user}
          onLogout={onLogout}
          preferredCurrency={preferredCurrency}
          onCurrencyChange={onCurrencyChange}
        />
      </div>
    </div>
  )
}
