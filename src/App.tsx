import { useState } from "react"
import { useKV } from "@github/spark/hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import { Watch } from "@/lib/types"
import { AppSidebar } from "@/components/AppSidebar"
import { AppHeader } from "@/components/AppHeader"
import { WelcomeModal } from "@/components/WelcomeModal"
import { CollectionModule } from "@/components/modules/CollectionModule"
import { PortfolioModule } from "@/components/modules/PortfolioModule"
import { MarketModule } from "@/components/modules/MarketModule"
import { AIAdvisorModule } from "@/components/modules/AIAdvisorModule"
import { DealsModule } from "@/components/modules/DealsModule"
import { AppraisalModule } from "@/components/modules/AppraisalModule"
import { Toaster } from "@/components/ui/sonner"
import { MobileNav } from "@/components/MobileNav"

function App() {
  const [watches, setWatches] = useKV<Watch[]>("watches", [])
  const [activeModule, setActiveModule] = useState('collection')
  const isMobile = useIsMobile()

  const watchList = watches || []
  const totalValue = watchList.reduce((sum, w) => sum + (w.currentValue || w.purchasePrice), 0)
  const uniqueBrands = [...new Set(watchList.map(w => w.brand))]

  const handleAddFirstWatch = () => {
    setActiveModule('collection')
  }

  const renderModule = () => {
    switch (activeModule) {
      case 'collection':
        return <CollectionModule watches={watchList} onUpdate={setWatches} />
      case 'portfolio':
        return <PortfolioModule watches={watchList} />
      case 'market':
        return <MarketModule watches={watchList} />
      case 'ai-advisor':
        return <AIAdvisorModule watches={watchList} />
      case 'deals':
        return <DealsModule userBrands={uniqueBrands} />
      case 'appraisal':
        return <AppraisalModule watches={watchList} />
      default:
        return <CollectionModule watches={watchList} onUpdate={setWatches} />
    }
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {!isMobile && <AppSidebar activeModule={activeModule} onModuleChange={setActiveModule} />}
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader totalValue={totalValue} isMobile={isMobile} />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <div className="max-w-7xl mx-auto">
            {renderModule()}
          </div>
        </main>
      </div>

      {isMobile && <MobileNav activeModule={activeModule} onModuleChange={setActiveModule} />}

      <WelcomeModal open={watchList.length === 0} onAddWatch={handleAddFirstWatch} />
      
      <Toaster />
    </div>
  )
}

export default App
