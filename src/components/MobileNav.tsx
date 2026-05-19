import { cn } from "@/lib/utils"

interface NavItem {
  id: string
  label: string
  icon: string
}

interface MobileNavProps {
  activeModule: string
  onModuleChange: (moduleId: string) => void
}

const navItems: NavItem[] = [
  { id: 'collection', label: 'Collection', icon: '◈' },
  { id: 'portfolio', label: 'Portfolio', icon: '◎' },
  { id: 'market', label: 'Market', icon: '◉' },
  { id: 'ai-advisor', label: 'AI', icon: '◍' },
  { id: 'deals', label: 'Deals', icon: '◫' },
  { id: 'appraisal', label: 'Report', icon: '◌' },
]

export function MobileNav({ activeModule, onModuleChange }: MobileNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-background/95 backdrop-blur-sm z-50">
      <nav className="h-full">
        <ul className="flex items-center justify-around h-full px-2">
          {navItems.map((item) => (
            <li key={item.id} className="flex-1">
              <button
                onClick={() => onModuleChange(item.id)}
                className={cn(
                  "w-full h-full flex flex-col items-center justify-center gap-1 transition-colors duration-150",
                  "active:scale-95 transition-transform"
                )}
              >
                <span className={cn(
                  "text-xl",
                  activeModule === item.id ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.icon}
                </span>
                <span className={cn(
                  "text-[10px] font-medium",
                  activeModule === item.id ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
