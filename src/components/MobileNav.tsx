import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"

interface NavItem {
  id: string
  label: string
  icon: string
}

interface MobileNavProps {
  activeModule: string
  onModuleChange: (moduleId: string) => void
  isAdmin?: boolean
}

// Primary 5-tab items — News replaces the old 6th slot; Market & Appraisal move to More
const primaryItems: NavItem[] = [
  { id: 'collection', label: 'Vault',  icon: '◈' },
  { id: 'portfolio',  label: 'Port.',  icon: '◎' },
  { id: 'news',       label: 'News',   icon: '◷' },
  { id: 'ai-advisor', label: 'AI',     icon: '◍' },
  { id: 'deals',      label: 'Deals',  icon: '◫' },
]

// Items in the "More" bottom sheet
const moreItems: NavItem[] = [
  { id: 'market',    label: 'Market',   icon: '◉' },
  { id: 'appraisal', label: 'Appraisal', icon: '◌' },
]

const adminItems: NavItem[] = [
  { id: 'admin-dashboard', label: 'Admin Dashboard', icon: '📊' },
  { id: 'feedback', label: 'Feedback', icon: '💬' },
]

export function MobileNav({ activeModule, onModuleChange, isAdmin = false }: MobileNavProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const visibleMoreItems = isAdmin ? [...moreItems, ...adminItems] : moreItems

  const handleMoreSelect = (id: string) => {
    onModuleChange(id)
    setMoreOpen(false)
  }

  // The ··· button is highlighted when the active module is one of the "More" items
  const moreActive = visibleMoreItems.some((item) => item.id === activeModule)

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-background/95 backdrop-blur-sm z-50">
        <nav className="h-full">
          <ul className="flex items-center justify-around h-full px-2">
            {primaryItems.map((item) => (
              <li key={item.id} className="flex-1">
                <button
                  onClick={() => onModuleChange(item.id)}
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-full gap-0.5 text-xs transition-colors",
                    activeModule === item.id
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            ))}

            {/* ··· More button */}
            <li className="flex-1">
              <button
                onClick={() => setMoreOpen(true)}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full gap-0.5 text-xs transition-colors",
                  moreActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="text-lg leading-none tracking-widest">···</span>
                <span className="font-medium">More</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>

      {/* More bottom drawer */}
      <Drawer open={moreOpen} onOpenChange={setMoreOpen} direction="bottom">
        <DrawerContent className="pb-safe">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-sm text-muted-foreground font-medium">More</DrawerTitle>
            <DrawerDescription className="sr-only">
              Additional navigation items including market, appraisal, and administrator modules.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 grid grid-cols-3 gap-3">
            {visibleMoreItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleMoreSelect(item.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 rounded-xl py-4 text-xs font-medium transition-colors border border-border",
                  activeModule === item.id
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
              >
                <span className="text-2xl">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
