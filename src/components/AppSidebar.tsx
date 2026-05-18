import { cn } from "@/lib/utils"

interface NavItem {
  id: string
  label: string
  icon: string
}

interface AppSidebarProps {
  activeModule: string
  onModuleChange: (moduleId: string) => void
}

const navItems: NavItem[] = [
  { id: 'collection', label: 'Collection', icon: '◈' },
  { id: 'portfolio', label: 'Portfolio', icon: '◎' },
  { id: 'market', label: 'Market', icon: '◉' },
  { id: 'ai-advisor', label: 'AI Advisor', icon: '◍' },
  { id: 'deals', label: 'Deals', icon: '◫' },
  { id: 'appraisal', label: 'Appraisal', icon: '◌' },
]

export function AppSidebar({ activeModule, onModuleChange }: AppSidebarProps) {
  return (
    <div className="w-60 h-screen border-r border-border bg-background flex flex-col">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-2xl text-primary">◈</span>
          <h1 className="text-xl font-semibold">WatchVault</h1>
        </div>
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onModuleChange(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-150",
                  "hover:bg-white/5",
                  activeModule === item.id && "bg-primary/10 border-l-2 border-primary"
                )}
              >
                <span className={cn(
                  "text-xl",
                  activeModule === item.id ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.icon}
                </span>
                <span className={cn(
                  "text-sm font-medium",
                  activeModule === item.id ? "text-foreground" : "text-muted-foreground"
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
