import { useState } from "react"
import { User } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SignOut, Vault, User as UserIcon, ChatCircleDots } from "@phosphor-icons/react"
import { FeedbackModal } from "@/components/FeedbackModal"
import { SUPPORTED_CURRENCIES } from "@/lib/currency"

interface UserProfileProps {
  user: User
  onLogout: () => void
  preferredCurrency: string
  onCurrencyChange: (currency: string) => void
}

export function UserProfile({ user, onLogout, preferredCurrency, onCurrencyChange }: UserProfileProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-10 w-10 rounded-full p-0">
            <Avatar className="h-10 w-10 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="cursor-default">
            <Vault className="mr-2 h-4 w-4" />
            <div className="flex flex-col">
              <span className="text-xs font-medium">{user.vaultName}</span>
              <span className="text-xs text-muted-foreground">Your Vault</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-2 space-y-2">
            <Label htmlFor="preferred-currency" className="text-xs text-muted-foreground">Preferred Currency</Label>
            <Select value={preferredCurrency} onValueChange={onCurrencyChange}>
              <SelectTrigger id="preferred-currency" className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
            <ChatCircleDots className="mr-2 h-4 w-4" />
            <span>Send Feedback</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled className="cursor-default opacity-50">
            <UserIcon className="mr-2 h-4 w-4" />
            <span>Account Settings</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
            <SignOut className="mr-2 h-4 w-4" />
            <span>Sign Out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FeedbackModal 
        open={feedbackOpen} 
        onClose={() => setFeedbackOpen(false)} 
        userEmail={user.email}
      />
    </>
  )
}
