import { cn } from "@/lib/utils"

  label: string
}
interface Mobil
  onModuleChan


  { id: 'market', label: '
  { id: 'deals', label
]
e

        <ul className="flex i
            <li key={item.id} className="flex-1">
                onClick={() => onModuleChange(item.id
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
























