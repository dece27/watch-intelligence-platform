import { useState, useEffect } from "react"
import { useKV } from "@github/spark/hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import { Watch, User } from "@/lib/types"
import { AppSidebar } from "@/components/AppSidebar"
import { AppHeader } from "@/components/AppHeader"
import { WelcomeModal } from "@/components/WelcomeModal"
import { LoginScreen } from "@/components/LoginScreen"
import { CollectionModule } from "@/components/modules/CollectionModule"
import { PortfolioModule } from "@/components/modules/PortfolioModule"
import { MarketModule } from "@/components/modules/MarketModule"
import { AIAdvisorModule } from "@/components/modules/AIAdvisorModule"
import { DealsModule } from "@/components/modules/DealsModule"
import { AppraisalModule } from "@/components/modules/AppraisalModule"
import { FeedbackDashboard } from "@/components/FeedbackDashboard"
import { Toaster } from "@/components/ui/sonner"
import { MobileNav } from "@/components/MobileNav"

function App() {
  const [currentUser, setCurrentUser] = useKV<User | null>("currentUser", null)
  const watchesKey = currentUser ? `watches_${currentUser.id}` : "watches_guest"
  const [watches, setWatches] = useKV<Watch[]>(watchesKey, [])
  const [activeModule, setActiveModule] = useState('collection')
  const [isOwner, setIsOwner] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [triggerAddWatch, setTriggerAddWatch] = useState(false)
  const isMobile = useIsMobile()

  const watchList = watches || []
  const totalValue = watchList.reduce((sum, w) => sum + (w.currentValue || w.purchasePrice), 0)
  const uniqueBrands = [...new Set(watchList.map(w => w.brand))]

  useEffect(() => {
    const checkOwnership = async () => {
      const userInfo = await window.spark.user()
      if (userInfo) {
        setIsOwner(userInfo.isOwner)
      }
    }
    checkOwnership()
  }, [])

  const handleLogin = (user: User) => {
    setCurrentUser(user)
  }

  const handleLogout = async () => {
    if (currentUser) {
      await window.spark.kv.set(`vaultMetadata_${currentUser.id}`, {
        userId: currentUser.id,
        vaultName: currentUser.vaultName,
        createdAt: currentUser.createdAt,
        lastAccessed: new Date().toISOString(),
        watchCount: watchList.length,
        totalValue: totalValue
      })
    }
    setCurrentUser(null)
    setActiveModule('collection')
  }

  const handleAddFirstWatch = () => {
    setActiveModule('collection')
    setShowWelcome(false)
    setTriggerAddWatch(true)
  }

  const renderModule = () => {
    switch (activeModule) {
      case 'collection':
        return <CollectionModule watches={watchList} onUpdate={setWatches} triggerAdd={triggerAddWatch} onTriggerComplete={() => setTriggerAddWatch(false)} />
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
      case 'feedback':
        return isOwner ? <FeedbackDashboard /> : <CollectionModule watches={watchList} onUpdate={setWatches} />
      default:
        return <CollectionModule watches={watchList} onUpdate={setWatches} />
    }
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {!isMobile && <AppSidebar activeModule={activeModule} onModuleChange={setActiveModule} isOwner={isOwner} />}
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader totalValue={totalValue} isMobile={isMobile} user={currentUser} onLogout={handleLogout} />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <div className="max-w-7xl mx-auto">
            {renderModule()}
          </div>
        </main>
      </div>

      {isMobile && <MobileNav activeModule={activeModule} onModuleChange={setActiveModule} />}

      <WelcomeModal 
        open={watchList.length === 0 && showWelcome} 
        onAddWatch={handleAddFirstWatch} 
        onOpenChange={setShowWelcome}
      />
      
      <Toaster />
    </div>
  )
}

export default App
